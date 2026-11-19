import { describe, expect, it } from 'vitest';
import {
  checkScope,
  expandPortSpec,
  isHostAllowed,
  isSafeNmapHost,
  isSafeNmapPorts,
  isValidPortSpec,
  normalizeHost,
  parseAllowedHosts,
  parseHttpUrl,
  portInRange,
  urlHasPrefix,
  type ScopeRuleLike,
  type ScopedTarget,
} from './scope.js';

const ALLOWED = parseAllowedHosts('bayawjobs.riomar.dev, BAYAWJOBS-API.riomar.dev ,localhost,127.0.0.1,');

function target(rules: ScopeRuleLike[] = [], base_url = 'https://bayawjobs.riomar.dev'): ScopedTarget {
  return { base_url, scope_rules: rules };
}

describe('helpers', () => {
  it('normalizes hosts', () => {
    expect(normalizeHost('  BayawJobs.Riomar.Dev. ')).toBe('bayawjobs.riomar.dev');
    expect(normalizeHost('[::1]')).toBe('::1');
  });

  it('parses the allowlist', () => {
    expect(ALLOWED).toEqual(['bayawjobs.riomar.dev', 'bayawjobs-api.riomar.dev', 'localhost', '127.0.0.1']);
  });

  it('matches the allowlist exactly (no subdomains, no suffix tricks)', () => {
    expect(isHostAllowed('bayawjobs.riomar.dev', ALLOWED)).toBe(true);
    expect(isHostAllowed('evil.bayawjobs.riomar.dev', ALLOWED)).toBe(false);
    expect(isHostAllowed('bayawjobs.riomar.dev.evil.com', ALLOWED)).toBe(false);
    expect(isHostAllowed('', ALLOWED)).toBe(false);
  });

  it('only accepts http(s) URLs without credentials', () => {
    expect(parseHttpUrl('https://bayawjobs.riomar.dev/a')).not.toBeNull();
    expect(parseHttpUrl('ftp://bayawjobs.riomar.dev')).toBeNull();
    expect(parseHttpUrl('file:///etc/passwd')).toBeNull();
    expect(parseHttpUrl('https://user:pass@bayawjobs.riomar.dev')).toBeNull();
    expect(parseHttpUrl('not a url')).toBeNull();
  });

  it('validates port specs', () => {
    expect(isValidPortSpec('80')).toBe(true);
    expect(isValidPortSpec('80, 443, 3000-3001')).toBe(true);
    expect(isValidPortSpec('0')).toBe(false);
    expect(isValidPortSpec('70000')).toBe(false);
    expect(isValidPortSpec('100-50')).toBe(false);
    expect(isValidPortSpec('80;rm')).toBe(false);
  });

  it('expands port specs with a cap', () => {
    expect(expandPortSpec('443, 80,8000-8002')).toEqual([80, 443, 8000, 8001, 8002]);
    expect(expandPortSpec('1-65535')).toBeNull();
    expect(expandPortSpec('1-1024')).toHaveLength(1024);
    expect(expandPortSpec('abc')).toBeNull();
  });

  it('checks ports against ranges', () => {
    expect(portInRange(443, '80,443')).toBe(true);
    expect(portInRange(8050, '8000-8100')).toBe(true);
    expect(portInRange(22, '80, 443, 8000-8100')).toBe(false);
  });

  it('checks URL prefixes by origin and path', () => {
    expect(urlHasPrefix('https://a.dev/api/users', 'https://a.dev/api')).toBe(true);
    expect(urlHasPrefix('http://a.dev/api/users', 'https://a.dev/api')).toBe(false);
    expect(urlHasPrefix('https://a.dev:8443/api', 'https://a.dev/api')).toBe(false);
  });

  it('guards Nmap inputs', () => {
    expect(isSafeNmapHost('bayawjobs.riomar.dev')).toBe(true);
    expect(isSafeNmapHost('-oN/tmp/x')).toBe(false);
    expect(isSafeNmapHost('a.dev; rm -rf /')).toBe(false);
    expect(isSafeNmapPorts('80,443')).toBe(true);
    expect(isSafeNmapPorts('1-1024')).toBe(true);
    expect(isSafeNmapPorts('80 443')).toBe(false);
    expect(isSafeNmapPorts('--script=x')).toBe(false);
  });
});

describe('checkScope', () => {
  it('1. allows the target host itself', () => {
    expect(checkScope(target(), { url: 'https://bayawjobs.riomar.dev/login' }, ALLOWED)).toEqual({ ok: true });
  });

  it('2. blocks hosts that are not on the allowlist, even with an in-scope rule', () => {
    const t = target([{ asset_type: 'HOST', value: 'example.com', in_scope: true }]);
    const r = checkScope(t, { host: 'example.com' }, ALLOWED);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/allowlist/);
  });

  it('3. blocks cloud metadata / SSRF targets', () => {
    expect(checkScope(target(), { url: 'http://169.254.169.254/latest/meta-data' }, ALLOWED).ok).toBe(false);
  });

  it('4. blocks an allowlisted host that is not part of this target', () => {
    const r = checkScope(target(), { host: 'bayawjobs-api.riomar.dev' }, ALLOWED);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/not in scope/);
  });

  it('5. allows an allowlisted host added as an in-scope HOST rule', () => {
    const t = target([{ asset_type: 'HOST', value: 'bayawjobs-api.riomar.dev', in_scope: true }]);
    expect(checkScope(t, { host: 'bayawjobs-api.riomar.dev' }, ALLOWED)).toEqual({ ok: true });
  });

  it('6. allows a host that only appears in an in-scope URL rule', () => {
    const t = target([{ asset_type: 'URL', value: 'https://bayawjobs-api.riomar.dev/api', in_scope: true }]);
    expect(checkScope(t, { url: 'https://bayawjobs-api.riomar.dev/api/health' }, ALLOWED)).toEqual({ ok: true });
  });

  it('7. out-of-scope HOST rule wins over the target host', () => {
    const t = target([{ asset_type: 'HOST', value: 'bayawjobs.riomar.dev', in_scope: false }]);
    expect(checkScope(t, { url: 'https://bayawjobs.riomar.dev/' }, ALLOWED).ok).toBe(false);
  });

  it('8. out-of-scope PORT_RANGE blocks the port', () => {
    const t = target([{ asset_type: 'PORT_RANGE', value: '22', in_scope: false }]);
    const r = checkScope(t, { host: 'bayawjobs.riomar.dev', port: 22 }, ALLOWED);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/out of scope/);
  });

  it('9. out-of-scope URL prefix blocks URLs under it only', () => {
    const t = target([{ asset_type: 'URL', value: 'https://bayawjobs.riomar.dev/admin', in_scope: false }]);
    expect(checkScope(t, { url: 'https://bayawjobs.riomar.dev/admin/users' }, ALLOWED).ok).toBe(false);
    expect(checkScope(t, { url: 'https://bayawjobs.riomar.dev/jobs' }, ALLOWED).ok).toBe(true);
  });

  it('10. in-scope PORT_RANGE rules restrict ports (including URL default ports)', () => {
    const t = target([{ asset_type: 'PORT_RANGE', value: '443', in_scope: true }]);
    expect(checkScope(t, { url: 'https://bayawjobs.riomar.dev/' }, ALLOWED).ok).toBe(true);
    expect(checkScope(t, { url: 'http://bayawjobs.riomar.dev/' }, ALLOWED).ok).toBe(false);
    expect(checkScope(t, { host: 'bayawjobs.riomar.dev', port: 8080 }, ALLOWED).ok).toBe(false);
  });

  it('11. in-scope URL rules restrict URLs on that host', () => {
    const t = target([{ asset_type: 'URL', value: 'https://bayawjobs.riomar.dev/api', in_scope: true }]);
    expect(checkScope(t, { url: 'https://bayawjobs.riomar.dev/api/jobs' }, ALLOWED).ok).toBe(true);
    const r = checkScope(t, { url: 'https://bayawjobs.riomar.dev/other' }, ALLOWED);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/in-scope URL rule/);
  });

  it('12. rejects bad input: no host, invalid URL, credentials, invalid port', () => {
    expect(checkScope(target(), {}, ALLOWED).ok).toBe(false);
    expect(checkScope(target(), { url: 'javascript:alert(1)' }, ALLOWED).ok).toBe(false);
    expect(checkScope(target(), { url: 'https://a:b@bayawjobs.riomar.dev/' }, ALLOWED).ok).toBe(false);
    expect(checkScope(target(), { host: 'bayawjobs.riomar.dev', port: 0 }, ALLOWED).ok).toBe(false);
    expect(checkScope(target(), { host: 'bayawjobs.riomar.dev', port: 70000 }, ALLOWED).ok).toBe(false);
  });

  it('13. normalizes case and trailing dots before comparing', () => {
    expect(checkScope(target(), { host: 'BAYAWJOBS.riomar.dev.' }, ALLOWED)).toEqual({ ok: true });
  });

  it('14. local development target works with localhost allowlisted', () => {
    const t = target([{ asset_type: 'PORT_RANGE', value: '8787', in_scope: true }], 'http://localhost:8787');
    expect(checkScope(t, { url: 'http://localhost:8787/api/health' }, ALLOWED)).toEqual({ ok: true });
    expect(checkScope(t, { url: 'http://localhost:5432/' }, ALLOWED).ok).toBe(false);
  });

  it('15. an empty allowlist blocks everything', () => {
    expect(checkScope(target(), { url: 'https://bayawjobs.riomar.dev/' }, []).ok).toBe(false);
  });
});
