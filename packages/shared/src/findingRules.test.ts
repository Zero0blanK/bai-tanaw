import { describe, expect, it } from 'vitest';
import { deriveToolFindings, normalizeFindingTitle, type RuleResult } from './findingRules.js';

const BASE = 'https://bayawjobs-api.riomar.dev';
let n = 0;
const r = (type: string, data: Record<string, unknown>): RuleResult => ({ id: `r${++n}`, type, data });
const derive = (results: RuleResult[], base = BASE) => deriveToolFindings({ tool: 'HTTP_CHECK', targetBaseUrl: base, results });

describe('deriveToolFindings', () => {
  it('turns missing security headers into findings, with HSTS only over HTTPS', () => {
    const results = [
      r('HEADER', { check: 'security_header', url: BASE, header: 'content-security-policy', present: false, value: null }),
      r('HEADER', { check: 'security_header', url: BASE, header: 'strict-transport-security', present: false, value: null }),
      r('HEADER', { check: 'security_header', url: BASE, header: 'x-frame-options', present: true, value: 'DENY' }),
    ];
    const out = derive(results);
    expect(out.map((f) => f.title)).toEqual(['Missing Content-Security-Policy header', 'Missing Strict-Transport-Security (HSTS) header']);
    expect(out[0]).toMatchObject({ category: 'SECURITY_CONFIG', severity: 'MEDIUM', wstg_id: 'WSTG-CONF-12', result_ids: [results[0]!.id] });

    const plain = derive([r('HEADER', { check: 'security_header', url: 'http://host.docker.internal:8787', header: 'strict-transport-security', present: false })]);
    expect(plain).toEqual([]);
  });

  it('groups minor headers into one INFO finding per URL', () => {
    const out = derive([
      r('HEADER', { check: 'security_header', url: BASE, header: 'referrer-policy', present: false }),
      r('HEADER', { check: 'security_header', url: BASE, header: 'permissions-policy', present: false }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: 'INFO', title: 'Recommended security headers missing' });
    expect(out[0]?.result_ids).toHaveLength(2);
  });

  it('flags disclosure headers, weak session cookies and CORS reflection', () => {
    const out = derive([
      r('HEADER', { check: 'disclosure_header', url: BASE, header: 'x-powered-by', value: 'Express' }),
      r('COOKIE', { url: BASE, name: 'refresh_token', secure: true, http_only: false, same_site: null, has_expiry: true, path: '/' }),
      r('COOKIE', { url: BASE, name: 'theme', secure: true, http_only: true, same_site: 'Lax', has_expiry: true, path: '/' }),
      r('CORS', { url: BASE, probe_origin: 'https://evil.invalid', allow_origin: 'https://evil.invalid', allow_credentials: true, reflects_foreign_origin: true, wildcard: false }),
    ]);
    const byTitle = Object.fromEntries(out.map((f) => [f.title, f]));
    expect(byTitle['Software disclosed in the x-powered-by header']).toMatchObject({ severity: 'LOW', wstg_id: 'WSTG-INFO-02' });
    expect(byTitle['Cookie "refresh_token" is missing HttpOnly, SameSite']).toMatchObject({ category: 'AUTHENTICATION', severity: 'MEDIUM' });
    expect(byTitle['CORS trusts any origin with credentials']).toMatchObject({ category: 'ACCESS_CONTROL', severity: 'HIGH', owasp_top10: 'A01:2021' });
    expect(out).toHaveLength(3);
  });

  it('flags no HTTPS redirect, unauthenticated admin routes and unexpected ports', () => {
    const out = deriveToolFindings({
      tool: 'NMAP',
      targetBaseUrl: 'http://host.docker.internal:8787',
      results: [
        r('REDIRECT', { from: 'http://bayawjobs.riomar.dev/', status: 200, location: null, redirects_to_https: false }),
        r('REDIRECT', { from: 'http://x/', status: null, location: null, redirects_to_https: null }),
        r('ENDPOINT', { method: 'get', path: '/api/admin/users', requires_auth: false, admin_route: true }),
        r('ENDPOINT', { method: 'get', path: '/api/admin/stats', requires_auth: true, admin_route: true }),
        r('PORT', { host: 'host.docker.internal', port: 8787, state: 'open', protocol: 'tcp' }),
        r('PORT', { host: 'host.docker.internal', port: 5432, state: 'open', protocol: 'tcp' }),
        r('PORT', { host: 'host.docker.internal', port: 22, state: 'closed', protocol: 'tcp' }),
      ],
    });
    expect(out.map((f) => f.title)).toEqual([
      'Plain HTTP is not redirected to HTTPS',
      'Admin route documented without authentication: GET /api/admin/users',
      'Unexpected open port 5432 on host.docker.internal',
    ]);
  });

  it('keeps ZAP Low+ alerts, drops Informational, and maps categories', () => {
    const out = derive([
      r('ALERT', { host: BASE, plugin_id: '10010', name: 'Cookie No HttpOnly Flag', risk: 'Low', count: 3, description: 'd', solution: 's', instances: [{ uri: `${BASE}/login` }] }),
      r('ALERT', { host: BASE, plugin_id: '10027', name: 'Information Disclosure - Suspicious Comments', risk: 'Informational', instances: [] }),
      r('ALERT', { host: BASE, plugin_id: '40012', name: 'Cross Site Scripting (Reflected)', risk: 'High', instances: [] }),
    ]);
    expect(out.map((f) => [f.title, f.category, f.severity])).toEqual([
      ['Cookie No HttpOnly Flag', 'AUTHENTICATION', 'LOW'],
      ['Cross Site Scripting (Reflected)', 'SECURITY_CONFIG', 'HIGH'],
    ]);
    expect(out[0]?.affected_asset).toBe(`${BASE}/login`);
    expect(out[0]?.description).toContain('Seen on 3 URLs');
  });

  it('gives the same fingerprint to the same problem, so re-scans can be de-duplicated', () => {
    const one = derive([r('HEADER', { check: 'security_header', url: BASE, header: 'content-security-policy', present: false })]);
    const two = derive([r('HEADER', { check: 'security_header', url: BASE, header: 'content-security-policy', present: false })]);
    expect(one[0]?.fingerprint).toBe(two[0]?.fingerprint);
  });

  it('normalizes titles for AI de-duplication', () => {
    expect(normalizeFindingTitle('Missing  HSTS header!')).toBe(normalizeFindingTitle('missing hsts Header'));
  });
});
