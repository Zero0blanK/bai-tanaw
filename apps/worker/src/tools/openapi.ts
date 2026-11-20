// Maps the target's entry points (WSTG-INFO-06) from its published OpenAPI spec.
// The endpoint list feeds the manual access-control tests (WSTG-ATHZ-02/03/04).

import type { ScanResultInput } from '@tanaw/shared';
import { truncate } from '@tanaw/shared/node';
import { toolFetch, type ToolOutput } from './http.js';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const MAX_ENDPOINTS = 500;
const MAX_SPEC_BYTES = 5 * 1024 * 1024;

interface OpenApiOperation {
  summary?: string;
  tags?: string[];
  security?: unknown[];
}

interface OpenApiSpec {
  security?: unknown[];
  paths?: Record<string, Record<string, OpenApiOperation | undefined>>;
}

/** A reason a candidate URL didn't yield a spec; lets discovery move on to the next one. */
class NotASpec extends Error {}

async function fetchSpec(specUrl: string, fetchImpl: typeof fetch): Promise<{ spec: OpenApiSpec; text: string }> {
  const res = await toolFetch(specUrl, { method: 'GET', headers: { accept: 'application/json' } }, fetchImpl);
  if (!res.ok) throw new NotASpec(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_SPEC_BYTES) throw new Error('OpenAPI spec is larger than 5 MB');
  let spec: OpenApiSpec & { openapi?: unknown; swagger?: unknown };
  try {
    spec = JSON.parse(text) as typeof spec;
  } catch {
    throw new NotASpec('not JSON');
  }
  if (!spec || typeof spec.paths !== 'object' || (spec.openapi === undefined && spec.swagger === undefined)) {
    throw new NotASpec('not an OpenAPI document');
  }
  return { spec, text };
}

export async function runOpenApiImport(specUrl: string, fetchImpl: typeof fetch = fetch): Promise<ToolOutput<ScanResultInput>> {
  let fetched: { spec: OpenApiSpec; text: string };
  try {
    fetched = await fetchSpec(specUrl, fetchImpl);
  } catch (error) {
    if (error instanceof NotASpec) throw new Error(`No OpenAPI spec at ${specUrl} (${error.message})`);
    throw error;
  }
  return endpointsFrom(fetched.spec, fetched.text);
}

/**
 * Tries each candidate URL in order (each must pass the scope guard; blocked ones are skipped and audited by it)
 * and imports the first real OpenAPI/Swagger document. The URL it came from is returned for the scan's params.
 */
export async function discoverOpenApi(
  candidates: string[],
  options: { allows: (request: { url: string }) => Promise<boolean>; fetchImpl?: typeof fetch },
): Promise<ToolOutput<ScanResultInput>> {
  const tried: string[] = [];
  for (const url of candidates) {
    if (!(await options.allows({ url }))) {
      tried.push(`${url} (out of scope)`);
      continue;
    }
    try {
      const { spec, text } = await fetchSpec(url, options.fetchImpl ?? fetch);
      return { ...endpointsFrom(spec, text), params: { found_url: url } };
    } catch (error) {
      if (!(error instanceof NotASpec) && (error as Error).message.includes('5 MB')) throw error;
      tried.push(`${url} (${error instanceof NotASpec ? error.message : (error as Error).name})`);
    }
  }
  const list = tried.slice(0, 8).join('; ');
  throw new Error(
    `No OpenAPI spec found on the target's in-scope hosts. Tried ${tried.length} URL${tried.length === 1 ? '' : 's'}: ${list}${tried.length > 8 ? '; …' : ''}. If the API publishes it elsewhere, run OpenAPI from Advanced with the spec URL.`,
  );
}

function endpointsFrom(spec: OpenApiSpec, text: string): ToolOutput<ScanResultInput> {
  const globalAuth = Array.isArray(spec.security) && spec.security.length > 0;
  const results: ScanResultInput[] = [];

  for (const [path, operations] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = operations?.[method];
      if (!op) continue;
      const requiresAuth = Array.isArray(op.security) ? op.security.length > 0 : globalAuth;
      results.push({
        type: 'ENDPOINT',
        data: {
          method: method.toUpperCase(),
          path,
          summary: truncate(op.summary, 200),
          tags: Array.isArray(op.tags) ? op.tags.slice(0, 10).map(String) : [],
          requires_auth: requiresAuth,
          admin_route: /(^|\/)admin(\/|$)/i.test(path),
        },
      });
      if (results.length >= MAX_ENDPOINTS) return { results, raw: { ext: 'json', content: text } };
    }
  }

  return { results, raw: { ext: 'json', content: text } };
}
