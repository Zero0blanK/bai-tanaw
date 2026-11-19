import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeFetch, startServer } from '../test/helpers.js';
import { runDnsLookup, type DnsResolver } from './dns.js';
import { CORS_PROBE_ORIGIN, runHttpCheck } from './httpCheck.js';
import { buildNmapArgs, runNmap } from './nmap.js';
import { runOpenApiImport } from './openapi.js';
import { runZap } from './zap.js';

const samples = new URL('../../../../samples/reports/', import.meta.url);
const allowAll = async () => true;

describe('runHttpCheck', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  beforeAll(async () => {
    srv = await startServer((req, res) => {
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('server', 'nginx/1.25.3');
      res.setHeader('set-cookie', ['sid=SECRETVALUE; Path=/; HttpOnly', 'theme=dark; Secure; SameSite=Lax; Max-Age=60']);
      const origin = req.headers.origin;
      if (origin) {
        res.setHeader('access-control-allow-origin', origin);
        res.setHeader('access-control-allow-credentials', 'true');
      }
      res.end('ok');
    });
  });
  afterAll(() => srv.close());

  it('reports headers, disclosure, cookie flags (never values) and a reflected CORS origin', async () => {
    const { results } = await runHttpCheck(`${srv.url}/`, { allows: allowAll });
    const headers = results.filter((r) => r.type === 'HEADER').map((r) => r.data);
    expect(headers[0]).toMatchObject({ check: 'response', status: 200 });
    expect(headers).toContainEqual(expect.objectContaining({ check: 'security_header', header: 'x-content-type-options', present: true }));
    expect(headers).toContainEqual(expect.objectContaining({ check: 'security_header', header: 'strict-transport-security', present: false }));
    expect(headers).toContainEqual(expect.objectContaining({ check: 'disclosure_header', header: 'server', value: 'nginx/1.25.3' }));

    const cookies = results.filter((r) => r.type === 'COOKIE').map((r) => r.data);
    expect(cookies).toContainEqual(expect.objectContaining({ name: 'sid', http_only: true, secure: false, has_expiry: false }));
    expect(cookies).toContainEqual(expect.objectContaining({ name: 'theme', secure: true, same_site: 'lax', has_expiry: true }));
    expect(JSON.stringify(results)).not.toContain('SECRETVALUE');

    const cors = results.find((r) => r.type === 'CORS')?.data;
    expect(cors).toMatchObject({ probe_origin: CORS_PROBE_ORIGIN, reflects_foreign_origin: true, allow_credentials: true });
    expect(results.some((r) => r.type === 'REDIRECT')).toBe(false); // only probed for https URLs
  });

  it('probes HTTP→HTTPS only when plain HTTP is in scope', async () => {
    const fetch = fakeFetch([
      [(u) => u.protocol === 'https:', () => new Response('ok', { headers: { 'strict-transport-security': 'max-age=31536000' } })],
      [(u) => u.protocol === 'http:', () => new Response(null, { status: 301, headers: { location: 'https://bayawjobs.riomar.dev/' } })],
    ]);
    const allowed = await runHttpCheck('https://bayawjobs.riomar.dev/', { allows: allowAll, fetchImpl: fetch.impl });
    expect(allowed.results.find((r) => r.type === 'REDIRECT')?.data).toMatchObject({ status: 301, redirects_to_https: true });

    const blocked = await runHttpCheck('https://bayawjobs.riomar.dev/', { allows: async () => false, fetchImpl: fetch.impl });
    expect(blocked.results.find((r) => r.type === 'REDIRECT')?.data).toMatchObject({ redirects_to_https: null, error: expect.stringMatching(/out of scope/) });
    expect(fetch.calls.filter((u) => u.protocol === 'http:')).toHaveLength(1);
  });
});

describe('runDnsLookup', () => {
  const noData = () => Promise.reject(Object.assign(new Error('none'), { code: 'ENODATA' }));
  const fake: DnsResolver = {
    resolve4: async () => [{ address: '104.21.0.1', ttl: 300 }],
    resolve6: noData,
    resolveCname: noData,
    resolveMx: async () => [{ priority: 10, exchange: 'mx.riomar.dev' }],
    resolveTxt: async () => [['v=spf1 ', '-all']],
    resolveNs: async () => ['ns1.cloudflare.com'],
    resolveCaa: async () => [{ critical: 0, issue: 'letsencrypt.org' }],
  };

  it('collects records and skips empty answers', async () => {
    const { results } = await runDnsLookup('bayawjobs.riomar.dev', fake);
    const values = results.map((r) => (r.type === 'DNS_RECORD' ? `${r.data.record_type} ${r.data.value}` : ''));
    expect(values).toEqual(['A 104.21.0.1', 'MX 10 mx.riomar.dev', 'TXT v=spf1 -all', 'NS ns1.cloudflare.com', 'CAA 0 issue "letsencrypt.org"']);
    expect(results[0]?.data).toMatchObject({ ttl: 300 });
  });

  it('fails when every lookup errors for a real reason', async () => {
    const broken = Object.fromEntries(
      Object.keys(fake).map((k) => [k, () => Promise.reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' }))]),
    ) as unknown as DnsResolver;
    await expect(runDnsLookup('bayawjobs.riomar.dev', broken)).rejects.toThrow(/ETIMEOUT/);
  });
});

describe('runOpenApiImport', () => {
  it('lists endpoints with auth and admin flags', async () => {
    const spec = {
      openapi: '3.0.0',
      security: [{ bearer: [] }],
      paths: {
        '/api/health': { get: { summary: 'Health', security: [] } },
        '/api/jobs': { get: { tags: ['Jobs'] }, post: {} },
        '/api/admin/users': { delete: { summary: 'Delete user' } },
      },
    };
    const fetch = fakeFetch([[() => true, () => Response.json(spec)]]);
    const { results, raw } = await runOpenApiImport('https://bayawjobs-api.riomar.dev/api/docs/openapi.json', fetch.impl);
    expect(results.map((r) => r.data)).toEqual([
      expect.objectContaining({ method: 'GET', path: '/api/health', requires_auth: false, admin_route: false }),
      expect.objectContaining({ method: 'GET', path: '/api/jobs', requires_auth: true, tags: ['Jobs'] }),
      expect.objectContaining({ method: 'POST', path: '/api/jobs', requires_auth: true }),
      expect.objectContaining({ method: 'DELETE', path: '/api/admin/users', admin_route: true }),
    ]);
    expect(raw?.ext).toBe('json');
  });

  it('rejects non-200 and non-OpenAPI responses', async () => {
    await expect(runOpenApiImport('https://x/spec', fakeFetch([[() => true, () => new Response('', { status: 404 })]]).impl)).rejects.toThrow(/404/);
    await expect(runOpenApiImport('https://x/spec', fakeFetch([[() => true, () => Response.json({ hello: 1 })]]).impl)).rejects.toThrow(/paths/);
  });
});

describe('Nmap', () => {
  it('builds a fixed, non-destructive argument array', () => {
    expect(buildNmapArgs('bayawjobs.riomar.dev', '80,443')).toEqual([
      '-sV', '-T3', '-Pn', '--max-retries', '2', '-p', '80,443', '-oX', '-', '--', 'bayawjobs.riomar.dev',
    ]);
  });

  it('refuses unsafe hosts and ports before anything runs', () => {
    expect(() => buildNmapArgs('-iL/etc/passwd', '80')).toThrow(/host/);
    expect(() => buildNmapArgs('a.dev;id', '80')).toThrow(/host/);
    expect(() => buildNmapArgs('a.dev', '80 --script=vuln')).toThrow(/ports/);
  });

  it('runs through execFile with a timeout and parses the XML', async () => {
    const xml = await readFile(new URL('nmap-local.xml', samples), 'utf8');
    const seen: Array<{ file: string; args: string[]; timeout: number }> = [];
    const out = await runNmap('localhost', '8787', {
      bin: '/usr/bin/nmap',
      timeoutMs: 1234,
      exec: async (file, args, options) => {
        seen.push({ file, args, timeout: options.timeout });
        return { stdout: xml, stderr: '' };
      },
    });
    expect(seen[0]).toMatchObject({ file: '/usr/bin/nmap', timeout: 1234 });
    expect(out.results.map((r) => r.type)).toEqual(['PORT', 'SERVICE']);
    expect(out.raw?.content).toBe(xml);
  });
});

describe('runZap', () => {
  const report = JSON.stringify({
    site: [
      {
        '@host': 'localhost',
        '@port': '8787',
        alerts: [
          {
            pluginid: '10038',
            alert: 'CSP Header Not Set',
            riskcode: '2',
            instances: [
              { uri: 'http://localhost:8787/api/health', evidence: 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln' },
              { uri: 'https://evil.example/x' },
            ],
          },
          { pluginid: '1', alert: 'Only off-scope', riskcode: '1', instances: [{ uri: 'https://evil.example/y' }] },
        ],
      },
    ],
  });

  function zapFake() {
    return fakeFetch([
      [(u) => u.pathname.includes('/context/action/newContext/'), () => Response.json({ contextId: '7' })],
      [(u) => u.pathname.includes('/spider/action/scan/'), () => Response.json({ scan: '3' })],
      [(u) => u.pathname.includes('/spider/view/status/'), () => Response.json({ status: '100' })],
      [(u) => u.pathname.includes('/pscan/view/recordsToScan/'), () => Response.json({ recordsToScan: '0' })],
      [(u) => u.pathname.includes('/OTHER/core/other/jsonreport/'), () => new Response(report)],
      [(u) => u.pathname.startsWith('/JSON/'), () => Response.json({ Result: 'OK' })],
    ]);
  }

  it('spiders inside a context, keeps only in-scope instances and redacts the raw report', async () => {
    const fetch = zapFake();
    const out = await runZap('http://localhost:8787/', 'tanaw-scan', {
      apiUrl: 'http://zap:8090',
      apiKey: 'k',
      spiderMaxMinutes: 5,
      activeScan: false,
      timeoutMs: 10_000,
      pollMs: 1,
      allows: async ({ url }) => new URL(url).hostname === 'localhost',
      fetchImpl: fetch.impl,
    });

    expect(out.results).toHaveLength(1);
    const alert = out.results[0];
    expect(alert?.type === 'ALERT' && alert.data.instances.map((i) => i.uri)).toEqual(['http://localhost:8787/api/health']);
    expect(JSON.stringify(out.results)).not.toContain('eyJ');
    expect(out.raw?.content).not.toContain('eyJhbGci');

    const spider = fetch.calls.find((u) => u.pathname.includes('/spider/action/scan/'));
    expect(spider?.searchParams.get('contextName')).toBe('tanaw-scan');
    expect(spider?.searchParams.get('subtreeOnly')).toBe('true');
    const include = fetch.calls.find((u) => u.pathname.includes('includeInContext'));
    expect(include?.searchParams.get('regex')).toBe('^http://localhost:8787/.*');
    expect(fetch.calls.some((u) => u.pathname.includes('/ascan/'))).toBe(false);
  });
});
