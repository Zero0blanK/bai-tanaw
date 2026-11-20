import { describe, expect, it } from 'vitest';
import { checkSuggestedVector, deriveToolFindings, extractCveIds, normalizeFindingTitle, type RuleResult } from './findingRules.js';

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

  it('suggests a scored CVSS v3.1 vector and derives the severity from it', () => {
    const out = derive([
      r('HEADER', { check: 'security_header', url: BASE, header: 'content-security-policy', present: false }),
      r('CORS', { url: BASE, probe_origin: 'https://evil.invalid', allow_origin: 'https://evil.invalid', allow_credentials: true, reflects_foreign_origin: true, wildcard: false }),
      r('HEADER', { check: 'security_header', url: BASE, header: 'referrer-policy', present: false }),
    ]);
    const csp = out.find((f) => f.title.startsWith('Missing Content-Security'));
    expect(csp).toMatchObject({ cvss_vector: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:L/A:N', cvss_score: 4.2, severity: 'MEDIUM' });
    expect(out.find((f) => f.title.startsWith('CORS'))).toMatchObject({ cvss_score: 7.1, severity: 'HIGH' });
    expect(out.find((f) => f.title.startsWith('Recommended'))).toMatchObject({ cvss_vector: null, cvss_score: null, severity: 'INFO' });
  });

  it('keeps the fix out of the description as a separate remediation suggestion', () => {
    const [f] = derive([r('COOKIE', { url: BASE, name: 'sid', secure: true, http_only: false, same_site: null })]);
    expect(f?.description).not.toMatch(/Fix:/);
    expect(f?.remediation).toContain('httpOnly: true');
    expect(f?.remediation).toContain("sameSite: 'lax'");
  });

  it('attaches only CVEs that the tool output itself names', () => {
    const out = derive([
      r('ALERT', { host: BASE, plugin_id: '10003', name: 'Vulnerable JS Library', risk: 'Medium', count: 1, description: 'jquery 1.8.1', solution: 'Upgrade', cve_ids: ['CVE-2020-11022'], other_info: 'CVE-2020-11023 and cve-2019-11358', instances: [] }),
      r('SERVICE', { host: 'h', port: 22, name: 'ssh', product: 'OpenSSH', version: '7.2', extra: null }),
      r('SERVICE', { host: 'h', port: 80, name: 'http', product: 'nginx', version: '1.18.0', extra: 'see CVE-2021-23017' }),
    ]);
    expect(out[0]?.cve_ids.sort()).toEqual(['CVE-2019-11358', 'CVE-2020-11022', 'CVE-2020-11023']);
    expect(out[0]?.owasp_top10).toBe('A06:2021');
    expect(out).toHaveLength(2); // the OpenSSH service names no CVE, so no finding
    expect(out[1]).toMatchObject({ title: 'Known vulnerabilities reported for nginx 1.18.0', cve_ids: ['CVE-2021-23017'] });
  });

  it('extracts and normalizes CVE IDs, and validates AI-suggested vectors', () => {
    expect(extractCveIds('x cve-2021-44228 y', { a: ['CVE-2021-44228', 'CVE-2014-0160'] })).toEqual(['CVE-2021-44228', 'CVE-2014-0160']);
    expect(checkSuggestedVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toEqual({ vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', score: 9.8 });
    expect(checkSuggestedVector('CVSS:3.1/AV:X')).toEqual({ vector: null, score: null });
    expect(checkSuggestedVector('')).toEqual({ vector: null, score: null });
  });
});
