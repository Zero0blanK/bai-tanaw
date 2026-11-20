export const USER_AGENT = 'Bai-Tanaw/1.0 (CS24 authorized security assessment)';
/** Per-request timeout for HTTP-based tools (HTTP check, OpenAPI). */
export const HTTP_TIMEOUT_MS = 15_000;

/** fetch with our user agent and a timeout. Never follows redirects (each hop would need its own scope check). */
export function toolFetch(url: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('user-agent', USER_AGENT);
  return fetchImpl(url, { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
}

export interface ToolOutput<R> {
  results: R[];
  /** Raw tool output to keep as evidence (stored under storage/targets/<id>/scans/). */
  raw?: { ext: 'xml' | 'json' | 'txt'; content: string };
  /** Facts learned while running (e.g. where the OpenAPI spec was found), merged into scans.params. */
  params?: Record<string, string>;
}
