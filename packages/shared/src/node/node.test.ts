import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ScanResultInputSchema } from '../schemas/scanResults.js';
import { LocalStorage, parseNmapXml, parseZapJson, redact } from './index.js';

const samples = new URL('../../../../samples/reports/', import.meta.url);
const sample = (name: string) => readFile(new URL(name, samples), 'utf8');

describe('parseNmapXml', () => {
  it('parses the local sample into PORT and SERVICE results with valid shapes', async () => {
    const report = parseNmapXml(await sample('nmap-local.xml'));
    expect(report.hosts).toEqual([{ host: 'localhost' }, { host: 'localhost', port: 8787 }]);
    expect(report.results.map((r) => r.type)).toEqual(['PORT', 'SERVICE']);
    expect(report.results[0]?.data).toMatchObject({ host: 'localhost', addresses: ['127.0.0.1'], port: 8787, state: 'open' });
    expect(report.results[1]?.data).toMatchObject({ name: 'http', product: 'workerd' });
    for (const r of report.results) expect(ScanResultInputSchema.safeParse(r).success).toBe(true);
  });

  it('reports the out-of-scope host from the evil sample so the importer can block it', async () => {
    const report = parseNmapXml(await sample('nmap-evil.xml'));
    expect(report.hosts.map((h) => h.host)).toContain('evil.example');
  });

  it('rejects non-Nmap and malformed input', () => {
    expect(() => parseNmapXml('<html></html>')).toThrow(/nmaprun/);
    expect(() => parseNmapXml('{"site":[]}')).toThrow();
    expect(() => parseNmapXml('<nmaprun scanner="nmap"></nmaprun>')).toThrow(/no hosts/);
    expect(() =>
      parseNmapXml('<nmaprun><runstats><finished exit="error" errormsg="NSE: failed to initialize"/></runstats></nmaprun>'),
    ).toThrow(/Nmap reported an error: NSE: failed/);
  });

  it('does not expand entities (no XXE / billion laughs)', () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>
      <nmaprun><host><hostnames><hostname name="&e;"/></hostnames></host></nmaprun>`;
    // fast-xml-parser either refuses the external entity outright or leaves it unexpanded.
    let host: string | undefined;
    try {
      host = parseNmapXml(xxe).hosts[0]?.host;
    } catch (error) {
      expect((error as Error).message).toMatch(/XML|nmaprun/);
      return;
    }
    expect(host).toBe('&e;');
  });
});

describe('parseZapJson', () => {
  it('parses alerts, maps risk names and redacts evidence', async () => {
    const report = parseZapJson(await sample('zap-local.json'));
    const alerts = report.results.filter((r) => r.type === 'ALERT');
    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.data).toMatchObject({ name: 'Content Security Policy (CSP) Header Not Set', risk: 'Medium', cwe_id: '693' });
    expect(alerts[0]?.data.description).toBe('CSP is not set.');
    const evidence = alerts[1]?.type === 'ALERT' ? alerts[1].data.instances[0]?.evidence : undefined;
    expect(evidence).not.toContain('eyJ');
    expect(evidence).toContain('[REDACTED]');
    for (const r of report.results) expect(ScanResultInputSchema.safeParse(r).success).toBe(true);
  });

  it('lists every instance host for scope checks', async () => {
    const report = parseZapJson(
      JSON.stringify({
        site: [{ '@host': 'localhost', '@port': '8787', alerts: [{ alert: 'x', riskcode: '1', instances: [{ uri: 'https://evil.example/a' }] }] }],
      }),
    );
    expect(report.hosts).toContainEqual({ host: 'evil.example', port: 443 });
  });

  it('rejects invalid JSON and other JSON', () => {
    expect(() => parseZapJson('{bad')).toThrow(/valid JSON/);
    expect(() => parseZapJson('{"nmaprun":{}}')).toThrow(/site/);
    expect(() => parseZapJson('null')).toThrow(/site/);
  });
});

describe('redact', () => {
  it('hides tokens, credentials and personal data', () => {
    const input = [
      'Authorization: Bearer abc.def.ghi',
      'Cookie: sid=12345; theme=dark',
      'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
      '{"password": "hunter22", "api_key":"k-123"}',
      'key sk-proj-abcdefghijklmnopqrstuv',
      'mail juan.delacruz@example.com',
      'call +63 917 123 4567 or 0917-123-4567',
      'hash 0123456789abcdef0123456789abcdef01234567',
    ].join('\n');
    const out = redact(input);
    for (const leaked of ['abc.def.ghi', 'sid=12345', 'eyJhbGci', 'hunter22', 'k-123', 'sk-proj', 'juan.delacruz', '917 123', '0917-123', '0123456789abcdef0123']) {
      expect(out).not.toContain(leaked);
    }
  });

  it('keeps ports, dates, versions and status codes', () => {
    const input = 'port 8443 open, nginx 1.25.3, HTTP 301 on 2026-11-19, CWE-693';
    expect(redact(input)).toBe(input);
  });
});

describe('LocalStorage', () => {
  let dir = '';
  afterAll(() => (dir ? rm(dir, { recursive: true, force: true }) : undefined));

  it('writes and reads files under the base directory', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tanaw-storage-'));
    const storage = new LocalStorage(dir);
    await storage.put('targets/t1/scans/s1.xml', '<nmaprun/>');
    expect((await storage.get('targets/t1/scans/s1.xml')).toString()).toBe('<nmaprun/>');
  });

  it('rejects traversal, absolute paths and odd characters', () => {
    const storage = new LocalStorage(tmpdir());
    for (const key of ['../etc/passwd', 'a/../../b', '/etc/passwd', 'C:\\x', 'a//b', 'a/./b', '', 'a b']) {
      expect(() => storage.resolveKey(key)).toThrow();
    }
  });
});
