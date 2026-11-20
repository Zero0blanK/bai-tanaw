#!/usr/bin/env node
// Tanaw acceptance checks (docs/acceptance.md): drives a RUNNING stack (API + worker + Postgres + Redis)
// end to end through the real HTTP API, like the demo. It only contacts Tanaw's own API (as the scan target)
// and never any external host.
//
//   npm run acceptance                      # uses API_URL / SEED_ADMIN_* from the root .env
//   API_URL=http://localhost:4000 npm run acceptance
//   ACCEPTANCE_TARGET_URL=http://host.docker.internal:4000 npm run acceptance   # Docker stack (docs/demo.md)
//
// The scan target is Tanaw's own API: API_URL's origin, or ACCEPTANCE_TARGET_URL when the worker reaches the API
// by another name (inside Docker, `localhost` is the worker container itself).
// Needs the target's host (`localhost`, or `host.docker.internal` for Docker) in ASSESSMENT_ALLOWED_HOSTS. Creates two throwaway users (deleted at the end) and two targets
// named "Acceptance <timestamp>" (targets can't be deleted; they stay as a record).

import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const envFile = new URL('.env', root);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const API = `${(process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '')}/api`;
const SELF = new URL(process.env.ACCEPTANCE_TARGET_URL ?? API).origin; // Tanaw's own API is the scan target
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const results = [];
const cleanup = [];
let adminToken = null;

// ─── tiny harness ────────────────────────────────────────────────────────────

function record(id, title, status, detail = '') {
  results.push({ id, title, status, detail });
  const icon = { PASS: '\x1b[32mPASS\x1b[0m', FAIL: '\x1b[31mFAIL\x1b[0m', SKIP: '\x1b[33mSKIP\x1b[0m' }[status];
  process.stdout.write(`${icon}  ${id.padEnd(4)} ${title}${detail ? `  (${detail})` : ''}\n`);
}

async function check(id, title, fn) {
  try {
    const out = await fn();
    if (out && typeof out === 'object' && out.skip) record(id, title, 'SKIP', out.skip);
    else record(id, title, 'PASS', typeof out === 'string' ? out : '');
  } catch (error) {
    record(id, title, 'FAIL', error instanceof Error ? error.message : String(error));
  }
}

function expect(cond, message) {
  if (!cond) throw new Error(message);
}

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, body: json, text };
}

function status(res, expected) {
  expect(res.status === expected, `expected ${expected}, got ${res.status}: ${res.body?.message ?? res.text.slice(0, 120)}`);
  return res;
}

async function login(email, password) {
  return status(await call('POST', '/auth/login', { body: { email, password } }), 200).body.data.access_token;
}

async function waitForJob(token, jobId, timeoutMs = 90_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const job = (await call('GET', `/jobs/${jobId}`, { token })).body?.data;
    if (job && (job.status === 'COMPLETED' || job.status === 'FAILED')) return job;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`job ${jobId} did not finish in ${timeoutMs / 1000}s (is the worker running?)`);
}

async function auditCount(token, action) {
  return status(await call('GET', `/audit-logs?action=${action}&limit=1`, { token }), 200).body.meta.total;
}

function sample(name) {
  return new Blob([readFileSync(new URL(`samples/reports/${name}`, root))]);
}

function fileForm(blob, filename, fields = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (blob) form.append('file', blob, filename);
  return form;
}

// ─── the checks ──────────────────────────────────────────────────────────────

async function main() {
  process.stdout.write(`Tanaw acceptance checks against ${API}\n\n`);
  const ctx = {};

  // 1. Access control and authentication
  await check('A1', 'API is healthy', async () => status(await call('GET', '/health'), 200) && 'ok');
  if (results.at(-1).status === 'FAIL') return;
  await check('A2', 'Unauthenticated requests get 401', async () => status(await call('GET', '/targets'), 401) && 'ok');
  await check('A3', 'Seeded admin can sign in', async () => {
    expect(process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set');
    ctx.admin = await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
    adminToken = ctx.admin;
  });
  if (!ctx.admin) return;
  await check('A4', 'Wrong password gets the generic 401', async () => {
    const res = status(await call('POST', '/auth/login', { body: { email: process.env.SEED_ADMIN_EMAIL, password: 'Wrong-Password-1!' } }), 401);
    expect(/Invalid email or password/.test(res.body.message), 'message reveals more than it should');
  });
  await check('A5', 'Admin creates an assessor and a viewer; both can sign in', async () => {
    const password = `Acc-${stamp.slice(-8)}-Pw1!x`;
    for (const role of ['ASSESSOR', 'VIEWER']) {
      const email = `acceptance-${role.toLowerCase()}-${stamp}@tanaw.test`.toLowerCase();
      const res = status(await call('POST', '/users', { token: ctx.admin, body: { email, name: `Acceptance ${role}`, password, role } }), 201);
      cleanup.push(res.body.data.id);
      ctx[role.toLowerCase()] = await login(email, password);
    }
  });
  await check('A6', 'Viewer cannot register targets (403)', async () => {
    status(await call('POST', '/targets', { token: ctx.viewer, body: { name: 'Nope', base_url: SELF } }), 403);
  });
  await check('A7', 'Assessor cannot manage users or read the audit log (403)', async () => {
    status(await call('GET', '/users', { token: ctx.assessor }), 403);
    status(await call('GET', '/audit-logs', { token: ctx.assessor }), 403);
  });

  // 2. Targets and scope
  const blocksBefore = await auditCount(ctx.admin, 'scope_blocked');
  await check('S1', 'A host off the allowlist cannot be registered (403)', async () => {
    status(await call('POST', '/targets', { token: ctx.assessor, body: { name: 'Not ours', base_url: 'https://example.com' } }), 403);
  });
  await check('S2', "Register Tanaw's own API as the target", async () => {
    const res = await call('POST', '/targets', {
      token: ctx.assessor,
      body: { name: `Acceptance ${stamp}`, base_url: SELF, authorization_note: 'Automated acceptance run against Tanaw itself.' },
    });
    if (res.status === 403) throw new Error(`${new URL(SELF).hostname} is not in ASSESSMENT_ALLOWED_HOSTS`);
    ctx.target = status(res, 201).body.data;
  });
  if (!ctx.target) return;
  const port = new URL(SELF).port || '80';
  await check('S3', `Add an in-scope PORT_RANGE rule (${port})`, async () => {
    status(await call('POST', `/targets/${ctx.target.id}/scope`, { token: ctx.assessor, body: { asset_type: 'PORT_RANGE', value: port } }), 201);
  });
  await check('S4', 'An in-scope HOST rule cannot widen past the allowlist (403)', async () => {
    status(await call('POST', `/targets/${ctx.target.id}/scope`, { token: ctx.assessor, body: { asset_type: 'HOST', value: 'evil.example' } }), 403);
  });
  await check('S5', 'Out-of-scope URL rule blocks scans under it (403)', async () => {
    status(await call('POST', `/targets/${ctx.target.id}/scope`, { token: ctx.assessor, body: { asset_type: 'URL', value: `${SELF}/api/admin`, in_scope: false } }), 201);
    status(await call('POST', `/targets/${ctx.target.id}/scans`, { token: ctx.assessor, body: { tool: 'HTTP_CHECK', url: `${SELF}/api/admin/x` } }), 403);
  });
  await check('S6', 'Scans to other hosts, other ports and cloud metadata are blocked (403)', async () => {
    for (const url of ['https://example.com/', 'http://localhost:5432/', 'http://169.254.169.254/latest/meta-data']) {
      status(await call('POST', `/targets/${ctx.target.id}/scans`, { token: ctx.assessor, body: { tool: 'HTTP_CHECK', url } }), 403);
    }
  });
  await check('S7', 'Viewer cannot start scans (403)', async () => {
    status(await call('POST', `/targets/${ctx.target.id}/scans`, { token: ctx.viewer, body: { tool: 'HTTP_CHECK' } }), 403);
  });
  await check('S8', 'Every scope block is in the audit log', async () => {
    const after = await auditCount(ctx.admin, 'scope_blocked');
    expect(after - blocksBefore >= 6, `expected at least 6 new scope_blocked rows, got ${after - blocksBefore}`);
    return `${after - blocksBefore} new rows`;
  });

  // 3. Tools through the worker
  await check('T1', 'HTTP check runs through the worker and stores results', async () => {
    const res = status(await call('POST', `/targets/${ctx.target.id}/scans`, { token: ctx.assessor, body: { tool: 'HTTP_CHECK', url: `${SELF}/api/health` } }), 202);
    const job = await waitForJob(ctx.assessor, res.body.data.job.id);
    expect(job.status === 'COMPLETED', `job ${job.status}: ${job.failed_reason}`);
    const scan = status(await call('GET', `/scans/${res.body.data.scan.id}`, { token: ctx.viewer }), 200).body.data;
    expect(scan.status === 'DONE' && (scan.result_counts.HEADER ?? 0) >= 9, `scan ${scan.status} with ${JSON.stringify(scan.result_counts)}`);
    ctx.httpScan = scan;
    const missing = scan.results.filter((r) => r.data.check === 'security_header' && !r.data.present).map((r) => r.data.header);
    return missing.length ? `missing headers: ${missing.join(', ')}` : 'all security headers present';
  });
  await check('T2', 'DNS lookup completes', async () => {
    const res = status(await call('POST', `/targets/${ctx.target.id}/scans`, { token: ctx.assessor, body: { tool: 'DNS' } }), 202);
    const job = await waitForJob(ctx.assessor, res.body.data.job.id);
    expect(job.status === 'COMPLETED', `job ${job.status}: ${job.failed_reason}`);
  });
  await check('T3', 'Nmap service detection runs (needs Nmap in the worker)', async () => {
    const res = status(await call('POST', `/targets/${ctx.target.id}/scans`, { token: ctx.assessor, body: { tool: 'NMAP', ports: port } }), 202);
    const job = await waitForJob(ctx.assessor, res.body.data.job.id, 180_000);
    if (job.status === 'FAILED' && /ENOENT|not found|not recognized/i.test(job.failed_reason ?? '')) return { skip: 'Nmap is not installed where the worker runs' };
    expect(job.status === 'COMPLETED', `job ${job.status}: ${job.failed_reason}`);
    const scan = status(await call('GET', `/scans/${res.body.data.scan.id}`, { token: ctx.assessor }), 200).body.data;
    expect((scan.result_counts.PORT ?? 0) >= 1, 'no PORT results');
    return 'PORT results stored';
  });

  // 4. Imports
  await check('I1', 'Register a second target for report imports (localhost:8787)', async () => {
    ctx.importTarget = status(await call('POST', '/targets', { token: ctx.assessor, body: { name: `Acceptance imports ${stamp}`, base_url: 'http://localhost:8787' } }), 201).body.data;
  });
  if (ctx.importTarget) {
    const t = ctx.importTarget.id;
    await check('I2', 'In-scope Nmap XML imports with PORT and SERVICE results', async () => {
      const res = status(await call('POST', `/targets/${t}/imports/nmap`, { token: ctx.assessor, form: fileForm(sample('nmap-local.xml'), 'nmap-local.xml') }), 201);
      expect(res.body.data.results === 2, `expected 2 results, got ${res.body.data.results}`);
    });
    await check('I3', 'A report with an out-of-scope host is rejected whole (403)', async () => {
      status(await call('POST', `/targets/${t}/imports/nmap`, { token: ctx.assessor, form: fileForm(sample('nmap-evil.xml'), 'nmap-evil.xml') }), 403);
    });
    await check('I4', 'ZAP JSON imports with secrets in evidence redacted', async () => {
      const res = status(await call('POST', `/targets/${t}/imports/zap`, { token: ctx.assessor, form: fileForm(sample('zap-local.json'), 'zap-local.json') }), 201);
      const scan = status(await call('GET', `/scans/${res.body.data.scan.id}`, { token: ctx.assessor }), 200);
      expect(!scan.text.includes('eyJhbGci'), 'a JWT from the report was stored');
      const raw = await call('GET', `/scans/${res.body.data.scan.id}/raw`, { token: ctx.assessor });
      expect(raw.status === 200, `raw download returned ${raw.status}`);
    });
    await check('I5', 'A file in the wrong format is refused (400)', async () => {
      status(await call('POST', `/targets/${t}/imports/nmap`, { token: ctx.assessor, form: fileForm(sample('zap-local.json'), 'zap.json') }), 400);
    });
  }

  // 5. AI
  await check('X1', 'AI interpretation: 503 without a key, 202 with one', async () => {
    if (!ctx.httpScan) return { skip: 'no finished scan' };
    const res = await call('POST', `/scans/${ctx.httpScan.id}/interpret`, { token: ctx.assessor });
    if (res.status === 503) return '503, AI not configured (expected without OPENAI_API_KEY)';
    status(res, 202);
    const job = await waitForJob(ctx.assessor, res.body.data.job.id, 120_000);
    expect(job.status === 'COMPLETED', `AI job ${job.status}: ${job.failed_reason}`);
    const findings = status(await call('GET', `/findings?target_id=${ctx.target.id}&source=AI`, { token: ctx.assessor }), 200).body.data;
    expect(findings.every((f) => f.status === 'PENDING'), 'an AI finding is not PENDING');
    return `AI suggested ${job.result?.findings_created ?? 0} PENDING finding(s)`;
  });
  await check('X2', 'Viewer cannot spend AI calls (403)', async () => {
    if (!ctx.httpScan) return { skip: 'no finished scan' };
    status(await call('POST', `/scans/${ctx.httpScan.id}/interpret`, { token: ctx.viewer }), 403);
  });

  // 6. Findings, verification, risk
  const newFinding = async (title) =>
    status(
      await call('POST', '/findings', {
        token: ctx.assessor,
        body: {
          target_id: ctx.target.id,
          title,
          category: 'SECURITY_CONFIG',
          description: 'Recorded by the acceptance run from the HTTP check results.',
          affected_asset: `${SELF}/api/health`,
          wstg_id: 'WSTG-CONF-14',
        },
      }),
      201,
    ).body.data;
  await check('F1', 'Manual findings start PENDING', async () => {
    ctx.finding = await newFinding(`Acceptance finding ${stamp}`);
    ctx.rejected = await newFinding(`Acceptance rejected ${stamp}`);
    expect(ctx.finding.status === 'PENDING' && ctx.finding.source === 'MANUAL', `got ${ctx.finding.status}/${ctx.finding.source}`);
  });
  const verify = (id, body, token = ctx.assessor) => call('PATCH', `/findings/${id}/verify`, { token, body });
  if (ctx.finding) {
    const f = ctx.finding.id;
    await check('F2', 'Confirming without severity and CVSS is refused (400)', async () => {
      status(await verify(f, { status: 'CONFIRMED', notes: 'Reproduced with curl.' }), 400);
    });
    await check('F3', 'Confirming without evidence is refused (400)', async () => {
      status(await verify(f, { status: 'CONFIRMED', notes: 'Reproduced with curl.', final_severity: 'LOW', cvss_score: 3.1 }), 400);
    });
    await check('F4', 'FIXED on a PENDING finding is refused (400)', async () => {
      status(await verify(f, { status: 'FIXED', notes: 'Looks fixed.' }), 400);
    });
    await check('F5', 'Evidence is stored with secrets redacted', async () => {
      const res = status(
        await call('POST', `/findings/${f}/evidence`, {
          token: ctx.assessor,
          body: { type: 'HTTP_EXCHANGE', content: 'GET /api/health\nAuthorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.c2ln\n\n200 OK' },
        }),
        201,
      );
      expect(!res.body.data.content.includes('eyJhbGci'), 'token stored in evidence');
    });
    await check('F6', 'Viewer cannot verify (403)', async () => {
      status(await verify(f, { status: 'REJECTED', notes: 'Viewer trying.' }, ctx.viewer), 403);
    });
    await check('F7', 'Confirm with a CVSS v3.1 vector; Tanaw computes the score', async () => {
      const res = status(
        await verify(f, { status: 'CONFIRMED', notes: 'Reproduced with curl -i.', final_severity: 'LOW', cvss_vector: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:N/I:L/A:N' }),
        200,
      );
      expect(res.body.data.cvss_score === 3.1, `score ${res.body.data.cvss_score}`);
    });
    await check('F8', 'Accept a remediation and mark FIXED after a retest', async () => {
      status(await call('PATCH', `/findings/${f}/remediation`, { token: ctx.assessor, body: { remediation: 'Add the missing header in the API and verify with curl -i.' } }), 200);
      status(await verify(f, { status: 'FIXED', notes: 'Retested: header now present.' }), 200);
      const detail = status(await call('GET', `/findings/${f}`, { token: ctx.viewer }), 200).body.data;
      expect(detail.verification_logs.length === 2, `history has ${detail.verification_logs.length} entries`);
    });
  }
  if (ctx.rejected) {
    await check('F9', 'Reject a finding with notes', async () => {
      status(await verify(ctx.rejected.id, { status: 'REJECTED', notes: 'Not applicable to this target.' }), 200);
    });
  }

  // 7. Dashboard, report, audit
  await check('R1', 'Dashboard counts the run (viewer can read it)', async () => {
    const d = status(await call('GET', `/dashboard?target_id=${ctx.target.id}`, { token: ctx.viewer }), 200).body.data;
    expect(d.totals.fixed >= 1 && (d.findings.by_status.REJECTED ?? 0) >= 1, JSON.stringify(d.totals));
  });
  await check('R2', 'Report holds only confirmed/fixed findings, with evidence and remediation', async () => {
    const r = status(await call('GET', `/targets/${ctx.target.id}/report`, { token: ctx.viewer }), 200).body.data;
    expect(r.findings.every((x) => x.status === 'CONFIRMED' || x.status === 'FIXED'), 'report includes an unverified finding');
    const mine = r.findings.find((x) => x.id === ctx.finding?.id);
    expect(mine && mine.evidence.length >= 1 && mine.remediation, 'confirmed finding missing evidence or remediation');
    expect(!r.findings.some((x) => x.id === ctx.rejected?.id), 'rejected finding is in the report');
  });
  await check('R3', 'Audit log has the key events', async () => {
    const needed = ['login_success', 'login_failed', 'user_created', 'target_created', 'scope_blocked', 'scan_started', 'report_imported', 'finding_verified', 'evidence_added', 'report_exported'];
    const missing = [];
    for (const action of needed) if ((await auditCount(ctx.admin, action)) === 0) missing.push(action);
    expect(missing.length === 0, `missing: ${missing.join(', ')}`);
  });
}

try {
  await main();
} finally {
  // Remove the throwaway users (their history stays, attributed to a deleted user).
  for (const id of cleanup) {
    await call('DELETE', `/users/${id}`, { token: adminToken }).catch(() => undefined);
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  process.stdout.write(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped\n`);
  process.exitCode = count('FAIL') > 0 || results.length === 0 ? 1 : 0;
}
