// HTTP security checks (WSTG-CONF-07 HSTS, WSTG-SESS-02 cookie attributes, WSTG-CONF-12/14 headers, CORS,
// HTTPS redirect), checked against the OWASP Secure Headers Project. Cookie values are never stored.

import type { ScanResultInput } from '@tanaw/shared';
import { truncate } from '@tanaw/shared/node';
import { toolFetch, type ToolOutput } from './http.js';

export const SECURITY_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
] as const;

/** Headers that reveal software or versions (information disclosure). */
export const DISCLOSURE_HEADERS = ['server', 'x-powered-by', 'x-aspnet-version', 'via'] as const;

/** A guaranteed-unresolvable origin (.invalid TLD), used only as an Origin header value. */
export const CORS_PROBE_ORIGIN = 'https://tanaw-cors-probe.invalid';

export function parseSetCookie(url: string, raw: string): Extract<ScanResultInput, { type: 'COOKIE' }> {
  const [pair = '', ...attrs] = raw.split(';').map((s) => s.trim());
  const name = pair.split('=')[0] ?? '';
  const lower = attrs.map((a) => a.toLowerCase());
  return {
    type: 'COOKIE',
    data: {
      url,
      name, // the value is intentionally not stored
      secure: lower.includes('secure'),
      http_only: lower.includes('httponly'),
      same_site: lower.find((a) => a.startsWith('samesite='))?.split('=')[1] ?? null,
      has_expiry: lower.some((a) => a.startsWith('expires=') || a.startsWith('max-age=')),
      path: lower.find((a) => a.startsWith('path='))?.split('=')[1] ?? null,
    },
  };
}

export interface HttpCheckOptions {
  /** Called before the optional plain-HTTP probe; returning false skips it. */
  allows: (request: { url: string }) => Promise<boolean>;
  fetchImpl?: typeof fetch;
}

export async function runHttpCheck(url: string, options: HttpCheckOptions): Promise<ToolOutput<ScanResultInput>> {
  const results: ScanResultInput[] = [];
  const fetchImpl = options.fetchImpl ?? fetch;

  // 1. Plain GET: status, security headers, disclosure headers, cookies.
  const res = await toolFetch(url, { method: 'GET' }, fetchImpl);
  await res.body?.cancel();
  results.push({ type: 'HEADER', data: { check: 'response', url, status: res.status, location: res.headers.get('location') } });

  for (const header of SECURITY_HEADERS) {
    const value = res.headers.get(header);
    results.push({
      type: 'HEADER',
      data: { check: 'security_header', url, header, present: value !== null, value: truncate(value, 400) },
    });
  }
  for (const header of DISCLOSURE_HEADERS) {
    const value = res.headers.get(header);
    if (value) results.push({ type: 'HEADER', data: { check: 'disclosure_header', url, header, value: truncate(value) ?? '' } });
  }
  for (const raw of res.headers.getSetCookie()) results.push(parseSetCookie(url, raw));

  // 2. CORS probe with a foreign Origin.
  const cors = await toolFetch(url, { method: 'GET', headers: { origin: CORS_PROBE_ORIGIN } }, fetchImpl);
  await cors.body?.cancel();
  const allowOrigin = cors.headers.get('access-control-allow-origin');
  results.push({
    type: 'CORS',
    data: {
      url,
      probe_origin: CORS_PROBE_ORIGIN,
      allow_origin: allowOrigin,
      allow_credentials: cors.headers.get('access-control-allow-credentials')?.toLowerCase() === 'true',
      reflects_foreign_origin: allowOrigin === CORS_PROBE_ORIGIN,
      wildcard: allowOrigin === '*',
    },
  });

  // 3. Does plain HTTP redirect to HTTPS? Only probed when http:// is in scope too.
  const parsed = new URL(url);
  if (parsed.protocol === 'https:') {
    const httpUrl = `http://${parsed.hostname}${parsed.pathname}${parsed.search}`;
    if (!(await options.allows({ url: httpUrl }))) {
      results.push({
        type: 'REDIRECT',
        data: { from: httpUrl, status: null, location: null, redirects_to_https: null, error: 'skipped: plain HTTP is out of scope' },
      });
    } else {
      try {
        const plain = await toolFetch(httpUrl, { method: 'GET' }, fetchImpl);
        await plain.body?.cancel();
        const location = plain.headers.get('location');
        results.push({
          type: 'REDIRECT',
          data: {
            from: httpUrl,
            status: plain.status,
            location,
            redirects_to_https: [301, 302, 307, 308].includes(plain.status) && Boolean(location?.startsWith('https://')),
          },
        });
      } catch (error) {
        results.push({
          type: 'REDIRECT',
          data: { from: httpUrl, status: null, location: null, redirects_to_https: null, error: (error as Error).message },
        });
      }
    }
  }

  return { results };
}
