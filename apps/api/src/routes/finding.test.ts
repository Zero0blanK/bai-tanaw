import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const enqueue = vi.fn(async (_type: string, jobId: string) => jobId);
vi.mock('../queues/assessment.queue.js', () => ({ enqueue, closeQueue: vi.fn() }));

const { createApp } = await import('../app.js');
const { prisma } = await import('../config/prisma.js');
const { storage } = await import('../config/storage.js');
const { createUser, hasTestDb, login, resetDb } = await import('../test/helpers.js');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const BASE = 'https://bayawjobs.riomar.dev';

describe.skipIf(!hasTestDb)('findings, verification, evidence, dashboard and report', () => {
  // A fresh app per test: the per-IP login rate limit lives in the app.
  let app = createApp();
  let token: string;
  let assessorId: string;
  let targetId: string;

  beforeEach(async () => {
    await resetDb();
    app = createApp();
    enqueue.mockClear();
    const assessor = await createUser('ASSESSOR');
    assessorId = assessor.id;
    token = (await login(app, assessor.email)).token;
    targetId = (await as(request(app).post('/api/targets')).send({ name: 'Bayaw Jobs', base_url: BASE })).body.data.id;
  });
  afterAll(async () => {
    const files = await prisma.evidence.findMany({ where: { file_path: { not: null } } });
    await Promise.all(files.map((e) => storage.remove(e.file_path ?? '')));
    await prisma.$disconnect();
  });

  function as(req: request.Test, bearer = token) {
    return req.set('authorization', `Bearer ${bearer}`);
  }

  async function manualFinding(body: Record<string, unknown> = {}) {
    const res = await as(request(app).post('/api/findings')).send({
      target_id: targetId,
      title: 'IDOR on /api/applications/:id',
      category: 'ACCESS_CONTROL',
      description: 'Applicant B can read applicant A application by changing the id.',
      affected_asset: `${BASE}/api/applications/:id`,
      wstg_id: 'WSTG-ATHZ-04',
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; status: string };
  }

  async function addTextEvidence(findingId: string, content = 'GET /api/applications/2 -> 200 with applicant A data') {
    const res = await as(request(app).post(`/api/findings/${findingId}/evidence`)).send({ type: 'HTTP_EXCHANGE', content });
    expect(res.status).toBe(201);
    return res.body.data as { id: string };
  }

  const verify = (id: string, body: Record<string, unknown>) => as(request(app).patch(`/api/findings/${id}/verify`)).send(body);

  describe('manual findings and listing', () => {
    it('creates PENDING manual findings and filters the list', async () => {
      const f = await manualFinding();
      expect(f).toMatchObject({ status: 'PENDING', source: 'MANUAL' });
      await manualFinding({ title: 'Missing HSTS header', category: 'SECURITY_CONFIG' });

      const all = await as(request(app).get(`/api/findings?target_id=${targetId}`));
      expect(all.body.meta.total).toBe(2);
      const cfg = await as(request(app).get('/api/findings?category=SECURITY_CONFIG'));
      expect(cfg.body.data.map((x: { title: string }) => x.title)).toEqual(['Missing HSTS header']);
      expect((await as(request(app).get('/api/findings?status=NOPE'))).status).toBe(400);
    });

    it('rejects a scan from another target and unknown targets', async () => {
      const other = (await as(request(app).post('/api/targets')).send({ name: 'Other', base_url: 'https://bayawjobs-api.riomar.dev' })).body.data.id;
      const scan = await prisma.scan.create({ data: { target_id: other, tool: 'MANUAL', source: 'IMPORT', status: 'DONE' } });
      const res = await as(request(app).post('/api/findings')).send({
        target_id: targetId, scan_id: scan.id, title: 'x title', category: 'ACCESS_CONTROL', description: 'long enough text', affected_asset: 'a',
      });
      expect(res.status).toBe(404);
    });

    it('viewers can read findings but not create or verify them', async () => {
      const f = await manualFinding();
      const viewer = await createUser('VIEWER');
      const viewerToken = (await login(app, viewer.email)).token;
      expect((await as(request(app).get(`/api/findings/${f.id}`), viewerToken)).status).toBe(200);
      expect((await as(request(app).post('/api/findings'), viewerToken).send({})).status).toBe(403);
      expect((await verify(f.id, { status: 'REJECTED', notes: 'nope nope' }).set('authorization', `Bearer ${viewerToken}`)).status).toBe(403);
    });
  });

  describe('verification (the status machine)', () => {
    it('confirms with severity, a CVSS vector it scores itself, and evidence; logs the decision in a transaction', async () => {
      const f = await manualFinding();
      await addTextEvidence(f.id);
      const res = await verify(f.id, {
        status: 'CONFIRMED',
        notes: 'Reproduced with two test applicant accounts in Burp Repeater.',
        final_severity: 'HIGH',
        cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N',
        owasp_top10: 'A01:2021 Broken Access Control',
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'CONFIRMED', final_severity: 'HIGH', cvss_score: 6.5 });

      const detail = await as(request(app).get(`/api/findings/${f.id}`));
      expect(detail.body.data.verification_logs).toEqual([
        expect.objectContaining({ old_status: 'PENDING', new_status: 'CONFIRMED', assessor: expect.objectContaining({ id: assessorId }) }),
      ]);
      expect(detail.body.data.allowed_transitions).toEqual(['FIXED']);
      expect(await prisma.auditLog.count({ where: { action: 'finding_verified' } })).toBe(1);
    });

    it('needs severity and score to confirm (400)', async () => {
      const f = await manualFinding();
      await addTextEvidence(f.id);
      expect((await verify(f.id, { status: 'CONFIRMED', notes: 'Reproduced it.' })).status).toBe(400);
      expect((await verify(f.id, { status: 'CONFIRMED', notes: 'Reproduced it.', final_severity: 'HIGH' })).status).toBe(400);
      expect((await prisma.finding.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('PENDING');
    });

    it('needs evidence to confirm', async () => {
      const f = await manualFinding();
      const res = await verify(f.id, { status: 'CONFIRMED', notes: 'Reproduced it.', final_severity: 'LOW', cvss_score: 3.1 });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/evidence/);
    });

    it('rejects a score that contradicts the vector', async () => {
      const f = await manualFinding();
      await addTextEvidence(f.id);
      const res = await verify(f.id, {
        status: 'CONFIRMED', notes: 'Reproduced it.', final_severity: 'CRITICAL', cvss_score: 9.8, cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:N/A:N',
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/scores 4.3/);
    });

    it('FIXED only after CONFIRMED; closed findings stay closed; PENDING is never set by hand', async () => {
      const f = await manualFinding();
      expect((await verify(f.id, { status: 'FIXED', notes: 'Looks fixed.' })).status).toBe(400);
      expect((await verify(f.id, { status: 'PENDING', notes: 'Reopen it.' })).status).toBe(400);

      expect((await verify(f.id, { status: 'FALSE_POSITIVE', notes: 'The id is checked server side.' })).status).toBe(200);
      expect((await verify(f.id, { status: 'CONFIRMED', notes: 'Changed my mind', final_severity: 'LOW', cvss_score: 3 })).status).toBe(400);

      const g = await manualFinding();
      await addTextEvidence(g.id);
      await verify(g.id, { status: 'CONFIRMED', notes: 'Reproduced it.', final_severity: 'MEDIUM', cvss_score: 5.4 });
      const fixed = await verify(g.id, { status: 'FIXED', notes: 'Retested after the ownership check was added: 403 now.' });
      expect(fixed.status).toBe(200);
      expect(fixed.body.data.status).toBe('FIXED');
      expect(await prisma.verificationLog.count({ where: { finding_id: g.id } })).toBe(2);
    });

    it('requires notes', async () => {
      const f = await manualFinding();
      expect((await verify(f.id, { status: 'REJECTED' })).status).toBe(400);
      expect((await verify(f.id, { status: 'REJECTED', notes: 'no' })).status).toBe(400);
    });
  });

  describe('remediation', () => {
    it('accepts an AI draft by id, or hand-written text', async () => {
      const f = await manualFinding();
      const analysis = await prisma.aiAnalysis.create({
        data: {
          finding_id: f.id, task: 'REMEDIATE', provider: 'openai', model: 'gpt-test', input_hash: 'h',
          output: { summary: 'Check ownership on every application read.', steps: ['Compare application.user_id with req.user.id'], code_example: 'if (app.user_id !== req.user.id) throw new ForbiddenError()', references: ['OWASP ASVS 4.0.3 V4.2.1'], confidence: 'HIGH' },
        },
      });
      const accepted = await as(request(app).patch(`/api/findings/${f.id}/remediation`)).send({ analysis_id: analysis.id });
      expect(accepted.status).toBe(200);
      expect(accepted.body.data.remediation).toContain('1. Compare application.user_id');
      expect(accepted.body.data.remediation).toContain('- OWASP ASVS 4.0.3 V4.2.1');

      const edited = await as(request(app).patch(`/api/findings/${f.id}/remediation`)).send({ remediation: 'Add an ownership check in the service layer.' });
      expect(edited.body.data.remediation).toBe('Add an ownership check in the service layer.');
      expect((await as(request(app).patch(`/api/findings/${f.id}/remediation`)).send({})).status).toBe(400);
    });

    it("won't accept a draft that belongs to another finding", async () => {
      const a = await manualFinding();
      const b = await manualFinding({ title: 'Another finding' });
      const analysis = await prisma.aiAnalysis.create({
        data: { finding_id: b.id, task: 'REMEDIATE', provider: 'openai', model: 'm', input_hash: 'h', output: { summary: 'x'.repeat(20), steps: ['step one'], code_example: '', references: [], confidence: 'LOW' } },
      });
      expect((await as(request(app).patch(`/api/findings/${a.id}/remediation`)).send({ analysis_id: analysis.id })).status).toBe(404);
    });
  });

  describe('evidence', () => {
    it('stores a screenshot and serves it back safely', async () => {
      const f = await manualFinding();
      const res = await as(request(app).post(`/api/findings/${f.id}/evidence`)).field('type', 'SCREENSHOT').attach('file', PNG, 'proof.png');
      expect(res.status).toBe(201);
      const file = await as(request(app).get(`/api/evidence/${res.body.data.id}/file`));
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toBe('image/png');
      expect(file.headers['content-security-policy']).toContain('sandbox');
      expect(Buffer.from(file.body as Buffer).subarray(0, 4)).toEqual(PNG.subarray(0, 4));
    });

    it('checks file bytes, not names: rejects fake images and binaries', async () => {
      const f = await manualFinding();
      const fake = await as(request(app).post(`/api/findings/${f.id}/evidence`)).field('type', 'SCREENSHOT').attach('file', Buffer.from('<svg onload=alert(1)>'), 'x.png');
      expect(fake.status).toBe(400);
      const binary = await as(request(app).post(`/api/findings/${f.id}/evidence`)).field('type', 'TOOL_OUTPUT').attach('file', Buffer.from([0, 1, 2, 3]), 'x.txt');
      expect(binary.status).toBe(400);
      expect((await as(request(app).post(`/api/findings/${f.id}/evidence`)).send({ type: 'HTTP_EXCHANGE' })).status).toBe(400);
    });

    it('redacts secrets in pasted HTTP exchanges', async () => {
      const f = await manualFinding();
      const e = await addTextEvidence(f.id, 'GET /api/me\nAuthorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln\n\n200 OK');
      const stored = await prisma.evidence.findUniqueOrThrow({ where: { id: e.id } });
      expect(stored.content).not.toContain('eyJhbGci');
      expect(stored.content).toContain('GET /api/me');
    });

    it('only links scan results from the same target', async () => {
      const f = await manualFinding();
      const other = (await as(request(app).post('/api/targets')).send({ name: 'Other', base_url: 'https://bayawjobs-api.riomar.dev' })).body.data.id;
      const scan = await prisma.scan.create({ data: { target_id: other, tool: 'HTTP_CHECK', source: 'WORKER', status: 'DONE' } });
      const result = await prisma.scanResult.create({ data: { scan_id: scan.id, type: 'HEADER', data: { check: 'response', url: 'x', status: 200, location: null } } });
      const res = await as(request(app).post(`/api/findings/${f.id}/evidence`)).send({ type: 'TOOL_OUTPUT', scan_result_id: result.id });
      expect(res.status).toBe(404);
    });
  });

  describe('retest', () => {
    it('re-queues the original tool scan for a confirmed finding', async () => {
      const scan = await prisma.scan.create({ data: { target_id: targetId, tool: 'HTTP_CHECK', source: 'WORKER', status: 'DONE', params: { url: `${BASE}/` } } });
      const f = await manualFinding({ scan_id: scan.id, title: 'Missing HSTS', category: 'SECURITY_CONFIG' });
      expect((await as(request(app).post(`/api/findings/${f.id}/retest`))).status).toBe(400); // still PENDING

      await addTextEvidence(f.id);
      await verify(f.id, { status: 'CONFIRMED', notes: 'Header missing in curl -I.', final_severity: 'LOW', cvss_score: 3.7 });
      const res = await as(request(app).post(`/api/findings/${f.id}/retest`));
      expect(res.status).toBe(202);
      expect(res.body.data.scan).toMatchObject({ tool: 'HTTP_CHECK', params: { url: `${BASE}/` } });
      expect(enqueue).toHaveBeenCalledWith('RUN_CHECK', res.body.data.job.id);
    });

    it('asks for a manual retest when there is no repeatable scan', async () => {
      const f = await manualFinding();
      await addTextEvidence(f.id);
      await verify(f.id, { status: 'CONFIRMED', notes: 'Reproduced it.', final_severity: 'HIGH', cvss_score: 7.1 });
      const res = await as(request(app).post(`/api/findings/${f.id}/retest`));
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/by hand/);
    });
  });

  describe('dashboard and report', () => {
    async function seedMix() {
      const confirmed = await manualFinding({ title: 'Confirmed IDOR' });
      await addTextEvidence(confirmed.id);
      await verify(confirmed.id, { status: 'CONFIRMED', notes: 'Reproduced it.', final_severity: 'HIGH', cvss_score: 7.1 });
      const rejected = await manualFinding({ title: 'Rejected thing' });
      await verify(rejected.id, { status: 'REJECTED', notes: 'Not reproducible.' });
      await prisma.finding.create({
        data: { target_id: targetId, title: 'AI pending', category: 'SECURITY_CONFIG', description: 'from AI', affected_asset: BASE, source: 'AI', ai_severity: 'MEDIUM' },
      });
      await prisma.scan.create({ data: { target_id: targetId, tool: 'DNS', source: 'WORKER', status: 'FAILED' } });
      return { confirmed };
    }

    it('counts findings and scans', async () => {
      await seedMix();
      const res = await as(request(app).get(`/api/dashboard?target_id=${targetId}`));
      expect(res.status).toBe(200);
      expect(res.body.data.totals).toEqual({ findings: 3, open_confirmed: 1, pending_review: 1, fixed: 0 });
      expect(res.body.data.findings.confirmed_by_severity).toEqual({ HIGH: 1 });
      expect(res.body.data.findings.pending_by_ai_severity).toEqual({ MEDIUM: 1 });
      expect(res.body.data.findings.by_source).toEqual({ AI: 1, MANUAL: 2 });
      expect(res.body.data.scans.by_status).toEqual({ FAILED: 1 });
    });

    it('report includes only confirmed/fixed findings with evidence and history, and is audited', async () => {
      const { confirmed } = await seedMix();
      const viewer = await createUser('VIEWER');
      const viewerToken = (await login(app, viewer.email)).token;
      const res = await as(request(app).get(`/api/targets/${targetId}/report`), viewerToken);
      expect(res.status).toBe(200);
      expect(res.body.data.findings.map((f: { id: string }) => f.id)).toEqual([confirmed.id]);
      const finding = res.body.data.findings[0];
      expect(finding).toMatchObject({ severity: 'HIGH', cvss_score: 7.1, cvss_rating: 'HIGH', verified: { status: 'CONFIRMED' } });
      expect(finding.evidence).toHaveLength(1);
      expect(res.body.data.methodology.frameworks).toContain('OWASP WSTG v4.2');
      expect(res.body.data.target).toMatchObject({ id: targetId, base_url: BASE });
      expect(await prisma.auditLog.count({ where: { action: 'report_exported' } })).toBe(1);
    });
  });
});
