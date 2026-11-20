// OWASP ZAP through its daemon API (WSTG-CONF, passive checks). Flow:
//   new session → context limited to the scan URL prefix → access URL → spider (context only, subtree only)
//   → wait for passive scanning → Traditional JSON report → keep only in-scope sites/instances, redacted.
// Active scanning (attacks) runs only when ZAP_ACTIVE_SCAN_ENABLED=true (instructor approval).
// The daemon is shared state, so runs are serialized with a simple in-process lock.

import type { ScanResultInput } from '@tanaw/shared';
import { parseZapJson, redact } from '@tanaw/shared/node';
import type { ToolOutput } from './http.js';

export interface ZapOptions {
  apiUrl: string;
  apiKey?: string | undefined;
  spiderMaxMinutes: number;
  activeScan: boolean;
  timeoutMs: number;
  /** Scope guard for every URL ZAP reports back. */
  allows: (request: { url: string }) => Promise<boolean>;
  fetchImpl?: typeof fetch;
  pollMs?: number;
}

type Params = Record<string, string | number | boolean>;

export class ZapClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call(format: 'JSON' | 'OTHER', component: string, type: string, name: string, params: Params = {}) {
    const url = new URL(`/${format}/${component}/${type}/${name}/`, this.apiUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = {};
    if (this.apiKey) headers['X-ZAP-API-Key'] = this.apiKey;
    const res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(60_000) });
    const text = await res.text();
    if (!res.ok) throw new Error(`ZAP API ${component}/${name} returned HTTP ${res.status}: ${text.slice(0, 200)}`);
    return text;
  }

  async json<T = Record<string, unknown>>(component: string, type: 'view' | 'action', name: string, params: Params = {}): Promise<T> {
    return JSON.parse(await this.call('JSON', component, type, name, params)) as T;
  }

  jsonReport(): Promise<string> {
    return this.call('OTHER', 'core', 'other', 'jsonreport');
  }
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lock: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => undefined);
  return run;
}

async function waitFor(check: () => Promise<boolean>, deadline: number, pollMs: number, what: string) {
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`ZAP ${what} did not finish in time`);
    await sleep(pollMs);
  }
}

/** Keeps alerts whose instances are in scope; drops out-of-scope instances and alerts left with none. */
async function filterInScope(results: ScanResultInput[], allows: ZapOptions['allows']): Promise<ScanResultInput[]> {
  const kept: ScanResultInput[] = [];
  for (const result of results) {
    if (result.type !== 'ALERT') continue;
    const instances = [];
    for (const instance of result.data.instances) {
      if (instance.uri && (await allows({ url: instance.uri }))) instances.push(instance);
    }
    if (instances.length > 0) kept.push({ type: 'ALERT', data: { ...result.data, instances } });
  }
  return kept;
}

export function runZap(url: string, contextName: string, options: ZapOptions): Promise<ToolOutput<ScanResultInput>> {
  return serialized(async () => {
    const zap = new ZapClient(options.apiUrl, options.apiKey, options.fetchImpl);
    const pollMs = options.pollMs ?? 2_000;
    const deadline = Date.now() + options.timeoutMs;

    await zap.json('core', 'action', 'newSession', { overwrite: true });
    const { contextId } = await zap.json<{ contextId: string }>('context', 'action', 'newContext', { contextName });
    await zap.json('context', 'action', 'includeInContext', { contextName, regex: `^${escapeRegex(url)}.*` });
    await zap.json('spider', 'action', 'setOptionMaxDuration', { Integer: options.spiderMaxMinutes });
    await zap.json('spider', 'action', 'setOptionMaxDepth', { Integer: 5 });

    await zap.json('core', 'action', 'accessUrl', { url, followRedirects: false });
    const { scan: spiderId } = await zap.json<{ scan: string }>('spider', 'action', 'scan', {
      url,
      contextName,
      recurse: true,
      subtreeOnly: true,
    });
    await waitFor(
      async () => (await zap.json<{ status: string }>('spider', 'view', 'status', { scanId: spiderId })).status === '100',
      deadline,
      pollMs,
      'spider',
    );

    if (options.activeScan) {
      const { scan: ascanId } = await zap.json<{ scan: string }>('ascan', 'action', 'scan', {
        url,
        contextId,
        recurse: true,
        inScopeOnly: true,
      });
      await waitFor(
        async () => (await zap.json<{ status: string }>('ascan', 'view', 'status', { scanId: ascanId })).status === '100',
        deadline,
        pollMs,
        'active scan',
      );
    }

    await waitFor(
      async () => Number((await zap.json<{ recordsToScan: string }>('pscan', 'view', 'recordsToScan')).recordsToScan) === 0,
      deadline,
      pollMs,
      'passive scan',
    );

    const report = await zap.jsonReport();
    await zap.json('context', 'action', 'removeContext', { contextName }).catch(() => undefined);

    const parsed = parseZapJson(report);
    return { results: await filterInScope(parsed.results, options.allows), raw: { ext: 'json', content: redact(report) } };
  });
}
