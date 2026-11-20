// Turns parsed scan results into candidate findings with fixed, explainable rules. Runs after every scan and
// import (worker and API), so every scan shows up in Findings even without AI. Each candidate is created PENDING
// with source TOOL; only an assessor confirms it (AGENT.md §2.5). The AI interpretation runs on top and is told
// which findings already exist, so it adds what the rules can't see instead of repeating them.
//
// Each candidate also carries suggestions the assessor can accept: a CVSS v3.1 vector (Bai-Tanaw scores it, and the
// suggested severity is derived from that score so the two never disagree), the fix text, and any CVE IDs that
// appear in the tool output behind it. Nothing here invents a CVE.
//
// `fingerprint` identifies "the same problem on the same asset", so a re-scan doesn't duplicate open findings.

import { cvss31BaseScore, cvssSeverity } from './cvss.js';
import type { FindingCategory, ScanResultType, ScanTool, Severity } from './enums/index.js';

export interface RuleResult {
  id: string;
  type: ScanResultType | string;
  data: unknown;
}

export interface CandidateFinding {
  fingerprint: string;
  title: string;
  category: FindingCategory;
  severity: Severity;
  affected_asset: string;
  description: string;
  owasp_top10: string | null;
  wstg_id: string | null;
  /** Suggested CVSS v3.1 vector and its computed score (null for informational findings). */
  cvss_vector: string | null;
  cvss_score: number | null;
  /** Suggested fix, shown to the assessor to accept or edit. */
  remediation: string;
  /** CVE IDs that appear in the backing scan results. */
  cve_ids: string[];
  /** Scan results that back this finding; linked as TOOL_OUTPUT evidence. */
  result_ids: string[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

const CVE_RE = /\bCVE-(\d{4})-(\d{4,7})\b/gi;

/** CVE IDs mentioned anywhere in the given values (deep), upper-cased, de-duplicated, at most 20. */
export function extractCveIds(...values: unknown[]): string[] {
  const found = new Set<string>();
  for (const value of values) {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    for (const m of text.matchAll(CVE_RE)) found.add(`CVE-${m[1]}-${m[2]}`);
  }
  return [...found].slice(0, 20);
}

/** Vectors used by the rules. Named so a reviewer can check each one against the CVSS v3.1 spec. */
const V = {
  /** Header hardening missing: needs a victim and another bug; limited impact. */
  hardeningCi: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:L/A:N',
  hardeningC: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N',
  clickjacking: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:N',
  disclosure: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N',
  corsCreds: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:L/A:N',
  corsReflect: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:N/A:N',
  adminNoAuth: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N',
  openPort: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N',
  /** ZAP gives a risk level, not a vector: these approximate its High / Medium / Low. */
  zapHigh: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:L/A:N',
  zapMedium: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N',
  zapLow: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N',
} as const;

/** Builds a candidate whose severity comes from its vector (INFO when there is no vector). */
function candidate(c: Omit<CandidateFinding, 'severity' | 'cvss_score' | 'cve_ids'> & { cve_ids?: string[] }): CandidateFinding {
  const score = c.cvss_vector ? cvss31BaseScore(c.cvss_vector) : null;
  return { ...c, cvss_score: score, severity: score === null ? 'INFO' : cvssSeverity(score), cve_ids: c.cve_ids ?? [] };
}

interface HeaderRule {
  title: string;
  vector: string;
  wstg: string;
  owasp: string;
  why: string;
  fix: string;
  /** Only meaningful over HTTPS. */
  httpsOnly?: boolean;
}

const HEADER_RULES: Record<string, HeaderRule> = {
  'content-security-policy': {
    title: 'Missing Content-Security-Policy header',
    vector: V.hardeningCi,
    wstg: 'WSTG-CONF-12',
    owasp: 'A05:2021',
    why: 'Without a CSP the browser runs any script that ends up in the page, so an XSS bug has full effect.',
    fix: "Send a Content-Security-Policy on every HTML response. Start with default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none' and add only the origins the app really loads from. Roll it out in Content-Security-Policy-Report-Only first, fix the reports, then enforce. In Express: helmet() with a contentSecurityPolicy directive list.",
  },
  'strict-transport-security': {
    title: 'Missing Strict-Transport-Security (HSTS) header',
    vector: V.hardeningCi,
    wstg: 'WSTG-CONF-07',
    owasp: 'A05:2021',
    why: 'Without HSTS a first visit or a typed http:// link can be downgraded to plain HTTP and intercepted.',
    fix: 'Send Strict-Transport-Security: max-age=31536000; includeSubDomains on every HTTPS response (helmet() does this in Express; on Cloudflare enable HSTS under SSL/TLS > Edge Certificates). Add preload only once every subdomain serves HTTPS.',
    httpsOnly: true,
  },
  'x-frame-options': {
    title: 'Missing clickjacking protection (X-Frame-Options)',
    vector: V.clickjacking,
    wstg: 'WSTG-CLNT-09',
    owasp: 'A05:2021',
    why: 'Other sites can load the page in a frame and trick users into clicking its controls.',
    fix: "Send X-Frame-Options: DENY (or SAMEORIGIN if the app frames itself), and the modern equivalent Content-Security-Policy: frame-ancestors 'none'.",
  },
  'x-content-type-options': {
    title: 'Missing X-Content-Type-Options header',
    vector: V.hardeningC,
    wstg: 'WSTG-CONF-12',
    owasp: 'A05:2021',
    why: 'Browsers may guess (sniff) content types and run uploaded or user-controlled content as script.',
    fix: 'Send X-Content-Type-Options: nosniff on every response, and make sure each response has the correct Content-Type.',
  },
};

/** Headers that are good practice but low impact: reported together as one INFO finding per URL. */
const MINOR_HEADERS = ['referrer-policy', 'permissions-policy', 'cross-origin-opener-policy', 'cross-origin-resource-policy'];

const SESSION_COOKIE = /(sess|sid|token|auth|jwt|refresh|login|remember)/i;

function isHttps(url: string | null): boolean {
  return Boolean(url?.toLowerCase().startsWith('https://'));
}

function expectedPorts(baseUrl: string): Set<number> {
  const ports = new Set([80, 443]);
  try {
    const u = new URL(baseUrl);
    ports.add(Number(u.port || (u.protocol === 'https:' ? 443 : 80)));
  } catch {
    // keep the defaults
  }
  return ports;
}

function zapCategory(name: string): FindingCategory {
  if (/(cookie|session|authenticat|password|credential|login|csrf|token)/i.test(name)) return 'AUTHENTICATION';
  if (/(access control|authoriz|privilege|idor|directory browsing|bypass)/i.test(name)) return 'ACCESS_CONTROL';
  return 'SECURITY_CONFIG';
}

const ZAP_VECTOR: Record<string, string> = { High: V.zapHigh, Medium: V.zapMedium, Low: V.zapLow };

export function deriveToolFindings(input: { tool: ScanTool | string; targetBaseUrl: string; results: RuleResult[] }): CandidateFinding[] {
  const out = new Map<string, CandidateFinding>();
  const add = (c: CandidateFinding) => {
    const existing = out.get(c.fingerprint);
    if (existing) {
      existing.result_ids.push(...c.result_ids.filter((id) => !existing.result_ids.includes(id)));
      existing.cve_ids = [...new Set([...existing.cve_ids, ...c.cve_ids])];
    } else out.set(c.fingerprint, c);
  };
  const minorByUrl = new Map<string, { headers: string[]; ids: string[] }>();
  const ports = expectedPorts(input.targetBaseUrl);

  for (const result of input.results) {
    const d = obj(result.data);
    const cves = extractCveIds(d);
    switch (result.type) {
      case 'HEADER': {
        const url = str(d.url) ?? input.targetBaseUrl;
        if (d.check === 'security_header' && d.present === false) {
          const header = String(d.header ?? '').toLowerCase();
          const rule = HEADER_RULES[header];
          if (rule) {
            if (rule.httpsOnly && !isHttps(url)) break;
            add(
              candidate({
                fingerprint: `header:${header}:${url}`,
                title: rule.title,
                category: 'SECURITY_CONFIG',
                affected_asset: url,
                description: `${url} does not send ${header}. ${rule.why}`,
                owasp_top10: rule.owasp,
                wstg_id: rule.wstg,
                cvss_vector: rule.vector,
                remediation: rule.fix,
                result_ids: [result.id],
              }),
            );
          } else if (MINOR_HEADERS.includes(header)) {
            const entry = minorByUrl.get(url) ?? { headers: [], ids: [] };
            entry.headers.push(header);
            entry.ids.push(result.id);
            minorByUrl.set(url, entry);
          }
        } else if (d.check === 'disclosure_header' && str(d.value)) {
          const header = String(d.header ?? '');
          add(
            candidate({
              fingerprint: `disclosure:${header.toLowerCase()}:${url}`,
              title: `Software disclosed in the ${header} header`,
              category: 'SECURITY_CONFIG',
              affected_asset: url,
              description: `${url} answers with ${header}: ${String(d.value).slice(0, 120)}. Naming the server software (and its version) helps an attacker pick known exploits.`,
              owasp_top10: 'A05:2021',
              wstg_id: 'WSTG-INFO-02',
              cvss_vector: V.disclosure,
              remediation: `Remove the ${header} header or reduce it to a generic value. In Express: app.disable('x-powered-by') (helmet() does this); for nginx: server_tokens off; behind Cloudflare, strip it with a Transform Rule. Keep the software itself patched either way.`,
              cve_ids: cves,
              result_ids: [result.id],
            }),
          );
        }
        break;
      }
      case 'COOKIE': {
        const name = str(d.name) ?? 'cookie';
        const url = str(d.url) ?? input.targetBaseUrl;
        const missing: string[] = [];
        if (d.secure !== true && isHttps(url)) missing.push('Secure');
        if (d.http_only !== true) missing.push('HttpOnly');
        if (!str(d.same_site)) missing.push('SameSite');
        if (missing.length === 0) break;
        const session = SESSION_COOKIE.test(name);
        add(
          candidate({
            fingerprint: `cookie:${name}:${missing.join(',')}`,
            title: `Cookie "${name}" is missing ${missing.join(', ')}`,
            category: session ? 'AUTHENTICATION' : 'SECURITY_CONFIG',
            affected_asset: url,
            description: `The cookie "${name}" set by ${url} has no ${missing.join(', ')} attribute. ${
              session ? 'It looks like a session or auth cookie, so ' : ''
            }without HttpOnly scripts can read it, without Secure it can travel over plain HTTP, and without SameSite it is sent on cross-site requests (CSRF).`,
            owasp_top10: session ? 'A07:2021' : 'A05:2021',
            wstg_id: 'WSTG-SESS-02',
            cvss_vector: session && missing.includes('HttpOnly') ? V.hardeningCi : V.hardeningC,
            remediation: `Set ${missing.join(', ')} on the "${name}" cookie wherever it is created, e.g. res.cookie('${name}', value, { ${[
              missing.includes('HttpOnly') && 'httpOnly: true',
              missing.includes('Secure') && 'secure: true',
              missing.includes('SameSite') && "sameSite: 'lax'",
            ]
              .filter(Boolean)
              .join(', ')} }). Use SameSite=Strict for auth cookies that are never needed on cross-site navigation.`,
            result_ids: [result.id],
          }),
        );
        break;
      }
      case 'CORS': {
        const url = str(d.url) ?? input.targetBaseUrl;
        if (d.reflects_foreign_origin === true) {
          const creds = d.allow_credentials === true;
          add(
            candidate({
              fingerprint: `cors:reflect:${url}`,
              title: creds ? 'CORS trusts any origin with credentials' : 'CORS reflects any origin',
              category: 'ACCESS_CONTROL',
              affected_asset: url,
              description: `${url} echoed the foreign probe origin ${String(d.probe_origin ?? '')} in Access-Control-Allow-Origin${
                creds ? ' and allows credentials, so any website can make logged-in requests and read the answers' : ', so any website can read its responses'
              }.`,
              owasp_top10: 'A01:2021',
              wstg_id: 'WSTG-CLNT-07',
              cvss_vector: creds ? V.corsCreds : V.corsReflect,
              remediation:
                'Replace origin reflection with an explicit allowlist: answer Access-Control-Allow-Origin only for known front-end origins (exact match, including scheme and port), never echo the request Origin, and send Access-Control-Allow-Credentials only for those origins. In Express: cors({ origin: [ "https://app.example" ], credentials: true }).',
              result_ids: [result.id],
            }),
          );
        } else if (d.wildcard === true) {
          add(
            candidate({
              fingerprint: `cors:wildcard:${url}`,
              title: 'CORS allows every origin (*)',
              category: 'ACCESS_CONTROL',
              affected_asset: url,
              description: `${url} sends Access-Control-Allow-Origin: *. Fine for public data, risky for anything private.`,
              owasp_top10: 'A01:2021',
              wstg_id: 'WSTG-CLNT-07',
              cvss_vector: V.hardeningC,
              remediation: 'If the endpoint returns anything user-specific, list the trusted origins instead of *. Keep * only for truly public, unauthenticated data.',
              result_ids: [result.id],
            }),
          );
        }
        break;
      }
      case 'REDIRECT': {
        if (d.redirects_to_https === false) {
          const from = str(d.from) ?? input.targetBaseUrl;
          add(
            candidate({
              fingerprint: `redirect:${from}`,
              title: 'Plain HTTP is not redirected to HTTPS',
              category: 'SECURITY_CONFIG',
              affected_asset: from,
              description: `${from} answered without redirecting to HTTPS, so users who type or follow an http:// link stay on an unencrypted connection.`,
              owasp_top10: 'A02:2021',
              wstg_id: 'WSTG-CRYP-03',
              cvss_vector: V.hardeningCi,
              remediation: 'Redirect every plain-HTTP request to the same URL over HTTPS with 301 or 308 (on Cloudflare: "Always Use HTTPS"), then add Strict-Transport-Security so browsers stop trying HTTP at all.',
              result_ids: [result.id],
            }),
          );
        }
        break;
      }
      case 'ENDPOINT': {
        if (d.admin_route === true && d.requires_auth !== true) {
          const route = `${String(d.method ?? '').toUpperCase()} ${String(d.path ?? '')}`.trim();
          add(
            candidate({
              fingerprint: `endpoint:noauth:${route}`,
              title: `Admin route documented without authentication: ${route}`,
              category: 'ACCESS_CONTROL',
              affected_asset: route,
              description: `The API's OpenAPI document lists ${route} as an admin route with no security requirement. If the server really skips the check, anyone can call it. Verify by calling it without a token.`,
              owasp_top10: 'A01:2021',
              wstg_id: 'WSTG-ATHZ-02',
              cvss_vector: V.adminNoAuth,
              remediation: `Put authentication and an admin-role check in front of ${route} on the server (the same middleware as the other admin routes, e.g. authenticate then requireRole('ADMIN')), and declare the security requirement in the OpenAPI document. Add a test that calls it without a token and expects 401.`,
              result_ids: [result.id],
            }),
          );
        }
        break;
      }
      case 'PORT': {
        const port = Number(d.port);
        if (d.state === 'open' && Number.isFinite(port) && !ports.has(port)) {
          const host = str(d.host) ?? '';
          add(
            candidate({
              fingerprint: `port:${host}:${port}`,
              title: `Unexpected open port ${port} on ${host}`,
              category: 'SECURITY_CONFIG',
              affected_asset: `${host}:${port}`,
              description: `Port ${port}/${String(d.protocol ?? 'tcp')} is open on ${host} but isn't one the target is expected to expose. Every extra service is more attack surface.`,
              owasp_top10: 'A05:2021',
              wstg_id: 'WSTG-CONF-01',
              cvss_vector: V.openPort,
              remediation: `Close port ${port} if the service isn't needed, or restrict it with a firewall to the hosts that need it. If it must stay public, keep the service patched and require authentication.`,
              cve_ids: cves,
              result_ids: [result.id],
            }),
          );
        }
        break;
      }
      case 'SERVICE': {
        // A service only becomes a finding when the scan output itself names CVEs for it.
        if (cves.length > 0) {
          const host = str(d.host) ?? '';
          const product = [str(d.product), str(d.version)].filter(Boolean).join(' ') || str(d.name) || 'service';
          add(
            candidate({
              fingerprint: `service-cve:${host}:${String(d.port ?? '')}`,
              title: `Known vulnerabilities reported for ${product}`,
              category: 'SECURITY_CONFIG',
              affected_asset: `${host}:${String(d.port ?? '')}`,
              description: `The scan reported ${product} on ${host}:${String(d.port ?? '')} with known CVEs: ${cves.join(', ')}. Check each one against the exact version and configuration before confirming.`,
              owasp_top10: 'A06:2021',
              wstg_id: 'WSTG-INFO-02',
              cvss_vector: V.disclosure,
              remediation: `Upgrade ${product} to a release that fixes ${cves.join(', ')}, or apply the vendor's mitigations; then re-run the assessment to confirm the version changed.`,
              cve_ids: cves,
              result_ids: [result.id],
            }),
          );
        }
        break;
      }
      case 'ALERT': {
        const vector = ZAP_VECTOR[String(d.risk)];
        if (!vector) break; // Informational alerts stay as scan results
        const name = str(d.name) ?? 'ZAP alert';
        const instances = Array.isArray(d.instances) ? d.instances.map(obj) : [];
        const asset = str(instances[0]?.uri) ?? str(d.host) ?? input.targetBaseUrl;
        add(
          candidate({
            fingerprint: `zap:${String(d.plugin_id ?? name)}:${str(d.host) ?? ''}`,
            title: name,
            category: zapCategory(name),
            affected_asset: asset,
            description: `${(str(d.description) ?? name).slice(0, 1500)}${Number(d.count) > 1 ? `\n\nSeen on ${Number(d.count)} URLs.` : ''}`,
            owasp_top10: cves.length > 0 ? 'A06:2021' : 'A05:2021',
            wstg_id: null,
            cvss_vector: vector,
            remediation: str(d.solution) ?? 'Follow the ZAP alert guidance for this plugin, then re-run the assessment.',
            cve_ids: cves,
            result_ids: [result.id],
          }),
        );
        break;
      }
      default:
        break;
    }
  }

  for (const [url, { headers, ids }] of minorByUrl) {
    add(
      candidate({
        fingerprint: `headers-minor:${url}`,
        title: 'Recommended security headers missing',
        category: 'SECURITY_CONFIG',
        affected_asset: url,
        description: `${url} does not send: ${headers.join(', ')}. These limit what other sites and browser features can do with the page.`,
        owasp_top10: 'A05:2021',
        wstg_id: 'WSTG-CONF-12',
        cvss_vector: null,
        remediation: 'Add them, for example Referrer-Policy: strict-origin-when-cross-origin, a Permissions-Policy that denies unused features (camera=(), microphone=(), geolocation=()), Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Resource-Policy: same-origin. helmet() sets most of them in Express.',
        result_ids: ids,
      }),
    );
  }

  return [...out.values()];
}

/** Normalized title, used to keep the AI from repeating a finding that already exists. */
export function normalizeFindingTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** A CVSS v3.1 vector the AI suggested, kept only if Bai-Tanaw can score it. Returns the vector and score, or nulls. */
export function checkSuggestedVector(vector: string | null | undefined): { vector: string | null; score: number | null } {
  const v = vector?.trim();
  if (!v) return { vector: null, score: null };
  const score = cvss31BaseScore(v);
  return score === null ? { vector: null, score: null } : { vector: v, score };
}

/** Statuses that block a new finding with the same fingerprint (FIXED doesn't: a reappearance is a regression). */
export const DEDUP_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED', 'FALSE_POSITIVE'] as const;

/** Tools whose results are worth sending to the AI automatically. DNS records rarely hold a finding. */
export const AUTO_INTERPRET_TOOLS: ReadonlyArray<string> = ['HTTP_CHECK', 'OPENAPI', 'NMAP', 'ZAP'];
