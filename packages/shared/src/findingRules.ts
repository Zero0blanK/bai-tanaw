// Turns parsed scan results into candidate findings with fixed, explainable rules. Runs after every scan and
// import (worker and API), so every scan shows up in Findings even without AI. Each candidate is created PENDING
// with source TOOL; only an assessor confirms it (AGENT.md §2.5). The AI interpretation runs on top and is told
// which findings already exist, so it adds what the rules can't see instead of repeating them.
//
// `fingerprint` identifies "the same problem on the same asset", so a re-scan doesn't duplicate open findings.

import type { FindingCategory, ScanResultType, ScanTool, Severity } from './enums/index.js';

export interface RuleResult {
  id: string;
  type: ScanResultType | string;
  data: unknown;
}

export interface CandidateFinding {
  fingerprint: string;
  title: string;
  category: FindingCategory;
  severity: Severity;
  affected_asset: string;
  description: string;
  owasp_top10: string | null;
  wstg_id: string | null;
  /** Scan results that back this finding; linked as TOOL_OUTPUT evidence. */
  result_ids: string[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

interface HeaderRule {
  title: string;
  severity: Severity;
  wstg: string;
  owasp: string;
  why: string;
  fix: string;
  /** Only meaningful over HTTPS. */
  httpsOnly?: boolean;
}

const HEADER_RULES: Record<string, HeaderRule> = {
  'content-security-policy': {
    title: 'Missing Content-Security-Policy header',
    severity: 'MEDIUM',
    wstg: 'WSTG-CONF-12',
    owasp: 'A05:2021',
    why: 'Without a CSP the browser runs any script that ends up in the page, so an XSS bug has full effect.',
    fix: "Send a Content-Security-Policy, starting with default-src 'self' and listing the origins the app really needs.",
  },
  'strict-transport-security': {
    title: 'Missing Strict-Transport-Security (HSTS) header',
    severity: 'MEDIUM',
    wstg: 'WSTG-CONF-07',
    owasp: 'A05:2021',
    why: 'Without HSTS a first visit or a typed http:// link can be downgraded to plain HTTP and intercepted.',
    fix: 'Send Strict-Transport-Security: max-age=31536000; includeSubDomains on every HTTPS response.',
    httpsOnly: true,
  },
  'x-frame-options': {
    title: 'Missing clickjacking protection (X-Frame-Options)',
    severity: 'LOW',
    wstg: 'WSTG-CLNT-09',
    owasp: 'A05:2021',
    why: 'Other sites can load the page in a frame and trick users into clicking its controls.',
    fix: "Send X-Frame-Options: DENY, or CSP frame-ancestors 'none'.",
  },
  'x-content-type-options': {
    title: 'Missing X-Content-Type-Options header',
    severity: 'LOW',
    wstg: 'WSTG-CONF-12',
    owasp: 'A05:2021',
    why: 'Browsers may guess (sniff) content types and run uploaded or user-controlled content as script.',
    fix: 'Send X-Content-Type-Options: nosniff on every response.',
  },
};

/** Headers that are good practice but low impact: reported together as one INFO finding per URL. */
const MINOR_HEADERS = ['referrer-policy', 'permissions-policy', 'cross-origin-opener-policy', 'cross-origin-resource-policy'];

const SESSION_COOKIE = /(sess|sid|token|auth|jwt|refresh|login|remember)/i;

function isHttps(url: string | null): boolean {
  return Boolean(url?.toLowerCase().startsWith('https://'));
}

function expectedPorts(baseUrl: string): Set<number> {
  const ports = new Set([80, 443]);
  try {
    const u = new URL(baseUrl);
    ports.add(Number(u.port || (u.protocol === 'https:' ? 443 : 80)));
  } catch {
    // keep the defaults
  }
  return ports;
}

function zapCategory(name: string): FindingCategory {
  if (/(cookie|session|authenticat|password|credential|login|csrf|token)/i.test(name)) return 'AUTHENTICATION';
  if (/(access control|authoriz|privilege|idor|directory browsing|bypass)/i.test(name)) return 'ACCESS_CONTROL';
  return 'SECURITY_CONFIG';
}

const ZAP_SEVERITY: Record<string, Severity> = { High: 'HIGH', Medium: 'MEDIUM', Low: 'LOW' };

export function deriveToolFindings(input: { tool: ScanTool | string; targetBaseUrl: string; results: RuleResult[] }): CandidateFinding[] {
  const out = new Map<string, CandidateFinding>();
  const add = (c: CandidateFinding) => {
    const existing = out.get(c.fingerprint);
    if (existing) existing.result_ids.push(...c.result_ids.filter((id) => !existing.result_ids.includes(id)));
    else out.set(c.fingerprint, c);
  };
  const minorByUrl = new Map<string, { headers: string[]; ids: string[] }>();
  const ports = expectedPorts(input.targetBaseUrl);

  for (const result of input.results) {
    const d = obj(result.data);
    switch (result.type) {
      case 'HEADER': {
        const url = str(d.url) ?? input.targetBaseUrl;
        if (d.check === 'security_header' && d.present === false) {
          const header = String(d.header ?? '').toLowerCase();
          const rule = HEADER_RULES[header];
          if (rule) {
            if (rule.httpsOnly && !isHttps(url)) break;
            add({
              fingerprint: `header:${header}:${url}`,
              title: rule.title,
              category: 'SECURITY_CONFIG',
              severity: rule.severity,
              affected_asset: url,
              description: `${url} does not send ${header}. ${rule.why}\n\nFix: ${rule.fix}`,
              owasp_top10: rule.owasp,
              wstg_id: rule.wstg,
              result_ids: [result.id],
            });
          } else if (MINOR_HEADERS.includes(header)) {
            const entry = minorByUrl.get(url) ?? { headers: [], ids: [] };
            entry.headers.push(header);
            entry.ids.push(result.id);
            minorByUrl.set(url, entry);
          }
        } else if (d.check === 'disclosure_header' && str(d.value)) {
          const header = String(d.header ?? '');
          add({
            fingerprint: `disclosure:${header.toLowerCase()}:${url}`,
            title: `Software disclosed in the ${header} header`,
            category: 'SECURITY_CONFIG',
            severity: 'LOW',
            affected_asset: url,
            description: `${url} answers with ${header}: ${String(d.value).slice(0, 120)}. Naming the server software (and its version) helps an attacker pick known exploits.\n\nFix: remove the header or reduce it to a generic value.`,
            owasp_top10: 'A05:2021',
            wstg_id: 'WSTG-INFO-02',
            result_ids: [result.id],
          });
        }
        break;
      }
      case 'COOKIE': {
        const name = str(d.name) ?? 'cookie';
        const url = str(d.url) ?? input.targetBaseUrl;
        const missing: string[] = [];
        if (d.secure !== true && isHttps(url)) missing.push('Secure');
        if (d.http_only !== true) missing.push('HttpOnly');
        if (!str(d.same_site)) missing.push('SameSite');
        if (missing.length === 0) break;
        const session = SESSION_COOKIE.test(name);
        add({
          fingerprint: `cookie:${name}:${missing.join(',')}`,
          title: `Cookie "${name}" is missing ${missing.join(', ')}`,
          category: session ? 'AUTHENTICATION' : 'SECURITY_CONFIG',
          severity: session && missing.includes('HttpOnly') ? 'MEDIUM' : 'LOW',
          affected_asset: url,
          description: `The cookie "${name}" set by ${url} has no ${missing.join(', ')} attribute. ${
            session ? 'It looks like a session or auth cookie, so ' : ''
          }without HttpOnly scripts can read it, without Secure it can travel over plain HTTP, and without SameSite it is sent on cross-site requests (CSRF).\n\nFix: set ${missing.join(', ')} on the cookie.`,
          owasp_top10: session ? 'A07:2021' : 'A05:2021',
          wstg_id: 'WSTG-SESS-02',
          result_ids: [result.id],
        });
        break;
      }
      case 'CORS': {
        const url = str(d.url) ?? input.targetBaseUrl;
        if (d.reflects_foreign_origin === true) {
          const creds = d.allow_credentials === true;
          add({
            fingerprint: `cors:reflect:${url}`,
            title: creds ? 'CORS trusts any origin with credentials' : 'CORS reflects any origin',
            category: 'ACCESS_CONTROL',
            severity: creds ? 'HIGH' : 'MEDIUM',
            affected_asset: url,
            description: `${url} echoed the foreign probe origin ${String(d.probe_origin ?? '')} in Access-Control-Allow-Origin${
              creds ? ' and allows credentials, so any website can make logged-in requests and read the answers' : ', so any website can read its responses'
            }.\n\nFix: answer only for an explicit allowlist of trusted origins.`,
            owasp_top10: 'A01:2021',
            wstg_id: 'WSTG-CLNT-07',
            result_ids: [result.id],
          });
        } else if (d.wildcard === true) {
          add({
            fingerprint: `cors:wildcard:${url}`,
            title: 'CORS allows every origin (*)',
            category: 'ACCESS_CONTROL',
            severity: 'LOW',
            affected_asset: url,
            description: `${url} sends Access-Control-Allow-Origin: *. Fine for public data, risky for anything private.\n\nFix: list the trusted origins instead of *.`,
            owasp_top10: 'A01:2021',
            wstg_id: 'WSTG-CLNT-07',
            result_ids: [result.id],
          });
        }
        break;
      }
      case 'REDIRECT': {
        if (d.redirects_to_https === false) {
          const from = str(d.from) ?? input.targetBaseUrl;
          add({
            fingerprint: `redirect:${from}`,
            title: 'Plain HTTP is not redirected to HTTPS',
            category: 'SECURITY_CONFIG',
            severity: 'MEDIUM',
            affected_asset: from,
            description: `${from} answered without redirecting to HTTPS, so users who type or follow an http:// link stay on an unencrypted connection.\n\nFix: redirect every plain-HTTP request to HTTPS with 301/308 and add HSTS.`,
            owasp_top10: 'A02:2021',
            wstg_id: 'WSTG-CRYP-03',
            result_ids: [result.id],
          });
        }
        break;
      }
      case 'ENDPOINT': {
        if (d.admin_route === true && d.requires_auth !== true) {
          const route = `${String(d.method ?? '').toUpperCase()} ${String(d.path ?? '')}`.trim();
          add({
            fingerprint: `endpoint:noauth:${route}`,
            title: `Admin route documented without authentication: ${route}`,
            category: 'ACCESS_CONTROL',
            severity: 'HIGH',
            affected_asset: route,
            description: `The API's OpenAPI document lists ${route} as an admin route with no security requirement. If the server really skips the check, anyone can call it.\n\nFix: require authentication and an admin role on the route, and declare it in the OpenAPI security section. Verify by calling it without a token.`,
            owasp_top10: 'A01:2021',
            wstg_id: 'WSTG-ATHZ-02',
            result_ids: [result.id],
          });
        }
        break;
      }
      case 'PORT': {
        const port = Number(d.port);
        if (d.state === 'open' && Number.isFinite(port) && !ports.has(port)) {
          const host = str(d.host) ?? '';
          add({
            fingerprint: `port:${host}:${port}`,
            title: `Unexpected open port ${port} on ${host}`,
            category: 'SECURITY_CONFIG',
            severity: 'LOW',
            affected_asset: `${host}:${port}`,
            description: `Port ${port}/${String(d.protocol ?? 'tcp')} is open on ${host} but isn't one the target is expected to expose. Every extra service is more attack surface.\n\nFix: close the port or restrict it with a firewall if it isn't needed publicly.`,
            owasp_top10: 'A05:2021',
            wstg_id: 'WSTG-CONF-01',
            result_ids: [result.id],
          });
        }
        break;
      }
      case 'ALERT': {
        const severity = ZAP_SEVERITY[String(d.risk)];
        if (!severity) break; // Informational alerts stay as scan results
        const name = str(d.name) ?? 'ZAP alert';
        const instances = Array.isArray(d.instances) ? d.instances.map(obj) : [];
        const asset = str(instances[0]?.uri) ?? str(d.host) ?? input.targetBaseUrl;
        const solution = str(d.solution);
        add({
          fingerprint: `zap:${String(d.plugin_id ?? name)}:${str(d.host) ?? ''}`,
          title: name,
          category: zapCategory(name),
          severity,
          affected_asset: asset,
          description: `${(str(d.description) ?? name).slice(0, 1500)}${
            Number(d.count) > 1 ? `\n\nSeen on ${Number(d.count)} URLs.` : ''
          }${solution ? `\n\nFix: ${solution.slice(0, 800)}` : ''}`,
          owasp_top10: 'A05:2021',
          wstg_id: null,
          result_ids: [result.id],
        });
        break;
      }
      default:
        break;
    }
  }

  for (const [url, { headers, ids }] of minorByUrl) {
    add({
      fingerprint: `headers-minor:${url}`,
      title: 'Recommended security headers missing',
      category: 'SECURITY_CONFIG',
      severity: 'INFO',
      affected_asset: url,
      description: `${url} does not send: ${headers.join(', ')}. These limit what other sites and browser features can do with the page.\n\nFix: add them (e.g. Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy denying unused features).`,
      owasp_top10: 'A05:2021',
      wstg_id: 'WSTG-CONF-12',
      result_ids: ids,
    });
  }

  return [...out.values()];
}

/** Normalized title, used to keep the AI from repeating a finding that already exists. */
export function normalizeFindingTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Statuses that block a new finding with the same fingerprint (FIXED doesn't: a reappearance is a regression). */
export const DEDUP_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED', 'FALSE_POSITIVE'] as const;

/** Tools whose results are worth sending to the AI automatically. DNS records rarely hold a finding. */
export const AUTO_INTERPRET_TOOLS: ReadonlyArray<string> = ['HTTP_CHECK', 'OPENAPI', 'NMAP', 'ZAP'];
