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

export async function runOpenApiImport(specUrl: string, fetchImpl: typeof fetch = fetch): Promise<ToolOutput<ScanResultInput>> {
  const res = await toolFetch(specUrl, { method: 'GET', headers: { accept: 'application/json' } }, fetchImpl);
  if (!res.ok) throw new Error(`OpenAPI spec request returned HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_SPEC_BYTES) throw new Error('OpenAPI spec is larger than 5 MB');

  let spec: OpenApiSpec;
  try {
    spec = JSON.parse(text) as OpenApiSpec;
  } catch {
    throw new Error('OpenAPI spec is not valid JSON');
  }
  if (!spec || typeof spec.paths !== 'object') throw new Error('Not an OpenAPI document (missing "paths")');

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
