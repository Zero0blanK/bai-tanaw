// Scope enforcement: the safety core of Bai-Tanaw (AGENT.md §7.3).
// Pure functions only, so the API and the worker run exactly the same checks.
// The API/worker wrappers add audit logging and turn a failed check into a 403.

import type { ScopeAssetType } from './enums/index.js';

export interface ScopeRuleLike {
  asset_type: ScopeAssetType;
  value: string;
  in_scope: boolean;
}

/** Minimal target shape the scope checks need. */
export interface ScopedTarget {
  base_url: string;
  scope_rules: readonly ScopeRuleLike[];
}

export interface ScopeRequest {
  url?: string | undefined;
  host?: string | undefined;
  port?: number | undefined;
}

export type ScopeDecision = { ok: true } | { ok: false; reason: string };

/** Lowercase, trimmed, no IPv6 brackets, no trailing dot. */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

/** Parses an http(s) URL. Returns null for anything else, including URLs with credentials. */
export function parseHttpUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  return url;
}

export function defaultPort(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

/** Splits ASSESSMENT_ALLOWED_HOSTS ("a.com, b.com") into normalized hosts. */
export function parseAllowedHosts(raw: string): string[] {
  return raw
    .split(',')
    .map((h) => normalizeHost(h))
    .filter(Boolean);
}

/** Hard allowlist check. Exact host match only (no wildcards, no subdomains). */
export function isHostAllowed(host: string, allowedHosts: readonly string[]): boolean {
  const normalized = normalizeHost(host);
  return normalized.length > 0 && allowedHosts.includes(normalized);
}

const PORT_SPEC_RE = /^\s*\d{1,5}(\s*-\s*\d{1,5})?(\s*,\s*\d{1,5}(\s*-\s*\d{1,5})?)*\s*$/;

/** True for "80", "80,443", "8000-8100", "80, 443, 3000-3001" with ports 1..65535 and start <= end. */
export function isValidPortSpec(spec: string): boolean {
  if (!PORT_SPEC_RE.test(spec)) return false;
  return spec.split(',').every((part) => {
    const [startRaw, endRaw] = part.split('-').map((p) => p.trim());
    const start = Number(startRaw);
    const end = endRaw === undefined ? start : Number(endRaw);
    return start >= 1 && end <= 65535 && start <= end;
  });
}

/** "80,443,8000-8002" → [80, 443, 8000, 8001, 8002]. Returns null if the spec is invalid or lists more than `max` ports. */
export function expandPortSpec(spec: string, max = 1024): number[] | null {
  if (!isValidPortSpec(spec)) return null;
  const ports = new Set<number>();
  for (const part of spec.split(',')) {
    const [startRaw, endRaw] = part.split('-').map((p) => Number(p.trim()));
    const start = startRaw ?? 0;
    const end = endRaw ?? start;
    if (end - start + 1 + ports.size > max) return null;
    for (let p = start; p <= end; p += 1) ports.add(p);
  }
  return [...ports].sort((a, b) => a - b);
}

export function portInRange(port: number, spec: string): boolean {
  if (!Number.isInteger(port)) return false;
  return spec.split(',').some((part) => {
    const [startRaw, endRaw] = part.trim().split('-');
    const start = Number(startRaw?.trim());
    const end = endRaw === undefined ? start : Number(endRaw.trim());
    return Number.isInteger(start) && Number.isInteger(end) && port >= start && port <= end;
  });
}

/** Same origin and the path starts with the prefix's path. */
export function urlHasPrefix(url: string, prefix: string): boolean {
  const a = parseHttpUrl(url);
  const b = parseHttpUrl(prefix);
  if (!a || !b) return false;
  return a.origin === b.origin && a.pathname.startsWith(b.pathname);
}

function hostOfUrl(value: string): string | undefined {
  const url = parseHttpUrl(value);
  return url ? normalizeHost(url.hostname) : undefined;
}

/**
 * Decides whether a host/URL/port is inside the authorized scope of a target:
 *  1. the host must be on the hard allowlist (this also stops SSRF to anything else),
 *  2. no out-of-scope rule (HOST, PORT_RANGE, URL prefix) may match,
 *  3. the host must be the target's own host or an in-scope HOST/URL rule,
 *  4. if in-scope PORT_RANGE rules exist, the port must be inside one of them,
 *  5. if in-scope URL rules exist for that host and a URL is given, it must sit under one of them.
 * In-scope rules can never widen past the allowlist, because rule 1 runs first.
 */
export function checkScope(
  target: ScopedTarget,
  request: ScopeRequest,
  allowedHosts: readonly string[],
): ScopeDecision {
  let host = request.host !== undefined ? normalizeHost(request.host) : undefined;
  let port = request.port;
  if (request.url !== undefined) {
    const url = parseHttpUrl(request.url);
    if (!url) return { ok: false, reason: 'URL must be a valid http(s) URL without credentials' };
    host = normalizeHost(url.hostname);
    port = port ?? defaultPort(url);
  }
  if (!host) return { ok: false, reason: 'no host given' };
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    return { ok: false, reason: `port ${port} is not a valid port` };
  }

  // 1. Hard allowlist.
  if (!isHostAllowed(host, allowedHosts)) return { ok: false, reason: `host ${host} is not on the allowlist` };

  const inScope = target.scope_rules.filter((r) => r.in_scope);
  const outOfScope = target.scope_rules.filter((r) => !r.in_scope);

  // 2. Out-of-scope rules always win.
  for (const rule of outOfScope) {
    if (rule.asset_type === 'HOST' && normalizeHost(rule.value) === host) {
      return { ok: false, reason: `host ${host} is marked out of scope` };
    }
    if (rule.asset_type === 'PORT_RANGE' && port !== undefined && portInRange(port, rule.value)) {
      return { ok: false, reason: `port ${port} is marked out of scope` };
    }
    if (rule.asset_type === 'URL' && request.url !== undefined && urlHasPrefix(request.url, rule.value)) {
      return { ok: false, reason: `URL is under out-of-scope prefix ${rule.value}` };
    }
  }

  // 3. Host must belong to the target.
  const targetHost = hostOfUrl(target.base_url);
  const hostRules = inScope.filter((r) => r.asset_type === 'HOST').map((r) => normalizeHost(r.value));
  const urlRules = inScope.filter((r) => r.asset_type === 'URL');
  const urlRuleHosts = urlRules.map((r) => hostOfUrl(r.value)).filter((h): h is string => Boolean(h));
  if (host !== targetHost && !hostRules.includes(host) && !urlRuleHosts.includes(host)) {
    return { ok: false, reason: `host ${host} is not in scope for this target` };
  }

  // 4. Port ranges.
  const portRules = inScope.filter((r) => r.asset_type === 'PORT_RANGE');
  if (port !== undefined && portRules.length > 0 && !portRules.some((r) => portInRange(port, r.value))) {
    return { ok: false, reason: `port ${port} is not in an in-scope port range` };
  }

  // 5. URL prefixes for this host.
  if (request.url !== undefined) {
    const requestUrl = request.url;
    const sameHostUrlRules = urlRules.filter((r) => hostOfUrl(r.value) === host);
    if (sameHostUrlRules.length > 0 && !sameHostUrlRules.some((r) => urlHasPrefix(requestUrl, r.value))) {
      return { ok: false, reason: 'URL is not under an in-scope URL rule' };
    }
  }

  return { ok: true };
}

/** What the API stores in scans.params and the worker reads back. */
export interface ScanParams {
  url?: string;
  host?: string;
  ports?: string;
  filename?: string;
  /** Set when the scan is part of a "run all tools" assessment, shared by every scan of that run. */
  batch_id?: string;
  /** OPENAPI only: no URL was given, so the worker looks for the spec (see openApiCandidates). */
  discover?: boolean;
  /** OPENAPI only: the URL the spec was actually found at (written by the worker). */
  found_url?: string;
}

/** Where APIs usually publish their OpenAPI/Swagger document. Order matters: the first hit wins. */
export const OPENAPI_PATHS = ['/api/docs/openapi.json', '/openapi.json', '/api/openapi.json', '/swagger.json', '/v3/api-docs', '/api-docs'] as const;
const MAX_OPENAPI_ORIGINS = 6;

/**
 * Candidate spec URLs for a target: the usual paths on the target's own origin, then on every other host the scope
 * rules mark in scope (a front end on one host often has its API on another, e.g. app.example and api.example).
 * Hosts that look like APIs ("api" in the name) go first. Every candidate must still pass the scope check.
 */
export function openApiCandidates(baseUrl: string, rules: ReadonlyArray<{ asset_type: string; value: string; in_scope: boolean }>): string[] {
  const base = parseHttpUrl(baseUrl);
  if (!base) return [];
  const origins: string[] = [base.origin];
  const others: string[] = [];
  for (const rule of rules) {
    if (!rule.in_scope) continue;
    if (rule.asset_type === 'HOST') others.push(`${base.protocol}//${normalizeHost(rule.value)}`);
    if (rule.asset_type === 'URL') {
      const u = parseHttpUrl(rule.value);
      if (u) others.push(u.origin);
    }
  }
  others.sort((a, b) => Number(/api/i.test(new URL(b).hostname)) - Number(/api/i.test(new URL(a).hostname)));
  for (const o of others) if (!origins.includes(o)) origins.push(o);
  return origins.slice(0, MAX_OPENAPI_ORIGINS).flatMap((origin) => OPENAPI_PATHS.map((path) => `${origin}${path}`));
}

export const MAX_NMAP_PORTS = 1024;

/**
 * Every host/URL/port a tool run will touch, so the API (when queueing) and the worker (when running)
 * check exactly the same list. Returns null when the params don't fit the tool.
 */
export function scopeRequestsForScan(tool: string, params: ScanParams): ScopeRequest[] | null {
  switch (tool) {
    case 'HTTP_CHECK':
    case 'OPENAPI':
    case 'ZAP':
      return params.url ? [{ url: params.url }] : null;
    case 'DNS':
      return params.host ? [{ host: params.host }] : null;
    case 'NMAP': {
      if (!params.host || !params.ports) return null;
      const ports = expandPortSpec(params.ports, MAX_NMAP_PORTS);
      if (!ports) return null;
      const host = params.host;
      return ports.map((port) => ({ host, port }));
    }
    default:
      return null;
  }
}

/** Nmap input guards (AGENT.md §7.4). Run before building the argument array. */
export const NMAP_HOST_RE = /^[a-z0-9.-]+$/;
export const NMAP_PORTS_RE = /^\d+(-\d+)?(,\d+(-\d+)?)*$/;

export function isSafeNmapHost(host: string): boolean {
  const h = normalizeHost(host);
  return h.length > 0 && h.length <= 253 && NMAP_HOST_RE.test(h) && !h.startsWith('-');
}

export function isSafeNmapPorts(ports: string): boolean {
  return NMAP_PORTS_RE.test(ports) && isValidPortSpec(ports);
}
