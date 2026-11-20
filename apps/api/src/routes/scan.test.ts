import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const enqueue = vi.fn(async (_type: string, jobId: string) => jobId);
vi.mock('../queues/assessment.queue.js', () => ({ enqueue, closeQueue: vi.fn() }));

const { createApp } = await import('../app.js');
const { prisma } = await import('../config/prisma.js');
const { storage } = await import('../config/storage.js');
const { createUser, hasTestDb, login, resetDb } = await import('../test/helpers.js');

const samples = new URL('../../../../samples/reports/', import.meta.url);
const sample = (name: string) => readFile(new URL(name, samples));

describe.skipIf(!hasTestDb)('scans, jobs and imports', () => {
  const app = createApp();
  let token: string;

  beforeEach(async () => {
    await resetDb();
    enqueue.mockClear();
    enqueue.mockImplementation(async (_type: string, jobId: string) => jobId);
    const assessor = await createUser('ASSESSOR');
    token = (await login(app, assessor.email)).token;
  });
  afterAll(() => prisma.$disconnect());

  const as = (req: request.Test, bearer = token) => req.set('authorization', `Bearer ${bearer}`);

  async function target(base_url = 'https://bayawjobs.riomar.dev', rules: Array<Record<string, unknown>> = []) {
    const res = await as(request(app).post('/api/targets')).send({ name: 'Bayaw Jobs', base_url });
    for (const rule of rules) await as(request(app).post(`/api/targets/${res.body.data.id}/scope`)).send(rule);
    return res.body.data.id as string;
  }

  describe('POST /targets/:id/scans', () => {
    it('queues an HTTP check with the target URL by default and returns 202 {scan, job}', async () => {
      const id = await target();
      const res = await as(request(app).post(`/api/targets/${id}/scans`)).send({ tool: 'HTTP_CHECK' });
      expect(res.status).toBe(202);
      expect(res.body.data.scan).toMatchObject({ tool: 'HTTP_CHECK', source: 'WORKER', status: 'QUEUED', params: { url: 'https://bayawjobs.riomar.dev' } });
      expect(res.body.data.job).toMatchObject({ type: 'RUN_CHECK', ref_id: res.body.data.scan.id, status: 'WAITING' });
      expect(res.body.data.job.bull_job_id).toBe(res.body.data.job.id);
      expect(enqueue).toHaveBeenCalledWith('RUN_CHECK', res.body.data.job.id);
      expect(await prisma.auditLog.count({ where: { action: 'scan_started' } })).toBe(1);

      const job = await as(request(app).get(`/api/jobs/${res.body.data.job.id}`));
      expect(job.body.data.status).toBe('WAITING');
    });

    it('fills defaults per tool', async () => {
      const id = await target();
      const dns = await as(request(app).post(`/api/targets/${id}/scans`)).send({ tool: 'DNS' });
      expect(dns.body.data.scan.params).toEqual({ host: 'bayawjobs.riomar.dev' });
      const nmap = await as(request(app).post(`/api/targets/${id}/scans`)).send({ tool: 'NMAP' });
      expect(nmap.body.data.scan.params).toEqual({ host: 'bayawjobs.riomar.dev', ports: '80,443' });
      expect(nmap.body.data.job.type).toBe('RUN_NMAP');
      const openapi = await as(request(app).post(`/api/targets/${id}/scans`)).send({ tool: 'OPENAPI' });
      expect(openapi.body.data.scan.params).toEqual({ url: 'https://bayawjobs.riomar.dev/api/docs/openapi.json', discover: true });
      const explicit = await as(request(app).post(`/api/targets/${id}/scans`)).send({ tool: 'OPENAPI', url: 'https://bayawjobs.riomar.dev/spec.json' });
      expect(explicit.body.data.scan.params).toEqual({ url: 'https://bayawjobs.riomar.dev/spec.json' });
      const zap = await as(request(app).post(`/api/targets/${id}/scans`)).send({ tool: 'ZAP' });
      expect(zap.body.data.job.type).toBe('RUN_ZAP');
    });

    it('blocks out-of-scope URLs, hosts and ports with 403, audits them and queues nothing', async () => {
      const id = await target('https://bayawjobs.riomar.dev', [
        { asset_type: 'PORT_RANGE', value: '443' },
        { asset_type: 'URL', value: 'https://bayawjobs.riomar.dev/admin', in_scope: false },
      ]);
      const cases = [
        { tool: 'HTTP_CHECK', url: 'https://example.com/' },
        { tool: 'HTTP_CHECK', url: 'https://bayawjobs.riomar.dev/admin/users' },
        { tool: 'DNS', host: 'bayawjobs-api.riomar.dev' },
        { tool: 'NMAP', ports: '22,443' },
        { tool: 'HTTP_CHECK', url: 'http://169.254.169.254/latest/meta-data' },
      ];
      for (const body of cases) {
        const res = await as(request(app).post(`/api/targets/${id}/scans`)).send(body);
        expect(res.status, JSON.stringify(body)).toBe(403);
      }
      expect(await prisma.scan.count()).toBe(0);
      expect(enqueue).not.toHaveBeenCalled();
      expect(await prisma.auditLog.count({ where: { action: 'scope_blocked' } })).toBe(cases.length);
    });

    it('refuses scans outside the test window', async () => {
      const id = await target();
      await as(request(app).patch(`/api/targets/${id}`)).send({ test_window_start: '2020-01-01', test_window_end: '2020-01-31' });
      const res = await as(request(app).post(`/api/targets/${id}/scans`)).send({ tool: 'HTTP_CHECK' });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/test window/);
    });

    it('rejects bad input: unknown tool, unsafe Nmap host, too many ports', async () => {
      const id = await target();
      expect((await as(request(app).post(`/api/targets/${id}/scans`)).send({ tool: 'MANUAL' })).status).toBe(400);
      expect((await as(request(app).post(`/api/targets/${id}/scans`)).send({ tool: 'NMAP', host: '-iL /etc/passwd' })).status).toBe(400);
      expect((await as(request(app).post(`/api/targets/${id}/scans`)).send({ tool: 'NMAP', ports: '1-65535' })).status).toBe(400);
    });

    it('returns 503 and marks the scan and job FAILED when the queue is down', async () => {
      enqueue.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const id = await target();
      const res = await as(request(app).post(`/api/targets/${id}/scans`)).send({ tool: 'HTTP_CHECK' });
      expect(res.status).toBe(503);
      expect((await prisma.scan.findFirstOrThrow()).status).toBe('FAILED');
      expect((await prisma.job.findFirstOrThrow()).status).toBe('FAILED');
    });

    it('viewers can list scans but not start them', async () => {
      const id = await target();
      const viewer = await createUser('VIEWER');
      const viewerToken = (await login(app, viewer.email)).token;
      expect((await as(request(app).post(`/api/targets/${id}/scans`), viewerToken).send({ tool: 'DNS' })).status).toBe(403);
      expect((await as(request(app).get(`/api/targets/${id}/scans`), viewerToken)).status).toBe(200);
    });
  });

  describe('POST /targets/:id/scans/all', () => {
    it('queues every tool as one run with a shared batch id', async () => {
      const id = await target();
      const res = await as(request(app).post(`/api/targets/${id}/scans/all`)).send({});
      expect(res.status).toBe(202);
      expect(res.body.data.skipped).toEqual([]);
      const runs = res.body.data.runs as Array<{ scan: { tool: string; params: Record<string, string> }; job: { type: string } }>;
      expect(runs.map((r) => r.scan.tool)).toEqual(['HTTP_CHECK', 'DNS', 'OPENAPI', 'NMAP', 'ZAP']);
      expect(new Set(runs.map((r) => r.scan.params.batch_id)).size).toBe(1);
      expect(runs.find((r) => r.scan.tool === 'NMAP')?.scan.params.ports).toBe('80,443');
      expect(enqueue).toHaveBeenCalledTimes(5);
      expect(await prisma.scan.count({ where: { target_id: id } })).toBe(5);
    });

    it("adds the target's own port to Nmap and keeps only ports the scope allows", async () => {
      const id = await target('http://localhost:8787', [{ asset_type: 'PORT_RANGE', value: '8787', in_scope: true }]);
      const res = await as(request(app).post(`/api/targets/${id}/scans/all`)).send({});
      expect(res.status).toBe(202);
      const nmap = res.body.data.runs.find((r: { scan: { tool: string } }) => r.scan.tool === 'NMAP');
      expect(nmap.scan.params).toMatchObject({ host: 'localhost', ports: '8787' });
    });

    it('skips (and audits) a tool whose requests are out of scope, and still runs the rest', async () => {
      const id = await target('https://bayawjobs.riomar.dev', [
        { asset_type: 'URL', value: 'https://bayawjobs.riomar.dev/api/docs', in_scope: false },
      ]);
      const res = await as(request(app).post(`/api/targets/${id}/scans/all`)).send({});
      expect(res.status).toBe(202);
      expect(res.body.data.skipped).toEqual([{ tool: 'OPENAPI', reason: expect.any(String) }]);
      expect(res.body.data.runs).toHaveLength(4);
      const block = await prisma.auditLog.findFirstOrThrow({ where: { action: 'scope_blocked' } });
      expect(block.metadata).toMatchObject({ tool: 'OPENAPI', batch_id: res.body.data.batch_id });
    });

    it('summarizes the latest run for the target page', async () => {
      const id = await target();
      const empty = await as(request(app).get(`/api/targets/${id}/assessment`));
      expect(empty.body.data).toMatchObject({ batch_id: null, scans: [], ai: [] });

      const run = await as(request(app).post(`/api/targets/${id}/scans/all`)).send({});
      const res = await as(request(app).get(`/api/targets/${id}/assessment`));
      expect(res.status).toBe(200);
      expect(res.body.data.batch_id).toBe(run.body.data.batch_id);
      expect(res.body.data.scans.map((s: { tool: string }) => s.tool)).toEqual(['HTTP_CHECK', 'DNS', 'OPENAPI', 'NMAP', 'ZAP']);
      expect(res.body.data.scans[0]).toMatchObject({ status: 'QUEUED', results: 0, findings: 0 });
    });

    it('viewers cannot run it', async () => {
      const id = await target();
      const viewer = await createUser('VIEWER');
      const vt = (await login(app, viewer.email)).token;
      expect((await as(request(app).post(`/api/targets/${id}/scans/all`), vt).send({})).status).toBe(403);
    });
  });

  describe('imports', () => {
    it('imports an in-scope Nmap report, stores the raw file and paginates results', async () => {
      const id = await target('http://localhost:8787');
      const res = await as(request(app).post(`/api/targets/${id}/imports/nmap`)).attach('file', await sample('nmap-local.xml'), 'nmap-local.xml');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ results: 2, scan: { tool: 'NMAP', source: 'IMPORT', status: 'DONE' } });
      const scanId = res.body.data.scan.id as string;

      const detail = await as(request(app).get(`/api/scans/${scanId}?limit=1`));
      expect(detail.status).toBe(200);
      expect(detail.body.data.results).toHaveLength(1);
      expect(detail.body.data.result_counts).toEqual({ PORT: 1, SERVICE: 1 });
      expect(detail.body.meta).toMatchObject({ total: 2, total_pages: 2 });
      const onlyServices = await as(request(app).get(`/api/scans/${scanId}?type=SERVICE`));
      expect(onlyServices.body.data.results[0].data).toMatchObject({ product: 'workerd' });

      const raw = await as(request(app).get(`/api/scans/${scanId}/raw`));
      expect(raw.status).toBe(200);
      expect(raw.headers['content-type']).toMatch(/xml/);
      expect(raw.headers['content-disposition']).toMatch(/attachment/);
      expect(raw.text).toContain('<nmaprun');
      expect(await prisma.auditLog.count({ where: { action: 'report_imported' } })).toBe(1);
      // Port 8787 is the target's own port, so the rules raise nothing; no AI key, so no AI job either.
      expect(res.body.data).toMatchObject({ findings_created: 0, ai: { queued: false } });
    });

    it('rejects the whole report when any host is out of scope', async () => {
      const id = await target('http://localhost:8787');
      const res = await as(request(app).post(`/api/targets/${id}/imports/nmap`)).attach('file', await sample('nmap-evil.xml'), 'evil.xml');
      expect(res.status).toBe(403);
      expect(await prisma.scan.count()).toBe(0);
      const block = await prisma.auditLog.findFirstOrThrow({ where: { action: 'scope_blocked' } });
      expect(block.metadata).toMatchObject({ context: 'import', request: { host: 'evil.example' } });
    });

    it('imports a ZAP report with redacted evidence', async () => {
      const id = await target('http://localhost:8787');
      const res = await as(request(app).post(`/api/targets/${id}/imports/zap`)).attach('file', await sample('zap-local.json'), 'zap.json');
      expect(res.status).toBe(201);
      const results = await prisma.scanResult.findMany({ where: { scan_id: res.body.data.scan.id } });
      expect(results).toHaveLength(2);
      expect(JSON.stringify(results)).not.toContain('eyJhbGci');

      // Low and Medium alerts become PENDING tool findings with the alert as evidence; a re-import adds none.
      expect(res.body.data.findings_created).toBe(2);
      const findings = await prisma.finding.findMany({ where: { target_id: id }, include: { evidence: true } });
      expect(findings.every((f) => f.source === 'TOOL' && f.status === 'PENDING' && f.evidence.length === 1)).toBe(true);
      // Each comes with a suggested CVSS (scored by Bai-Tanaw) and ZAP's own solution as the suggested fix.
      expect(findings.every((f) => f.suggested_cvss_score !== null && f.suggested_cvss_vector?.startsWith('CVSS:3.1/') && (f.suggested_remediation ?? '').length > 0)).toBe(true);
      const again = await as(request(app).post(`/api/targets/${id}/imports/zap`)).attach('file', await sample('zap-local.json'), 'zap.json');
      expect(again.body.data).toMatchObject({ findings_created: 0, duplicates: 2 });
    });

    it('rejects wrong formats, missing files and oversized files', async () => {
      const id = await target('http://localhost:8787');
      const wrong = await as(request(app).post(`/api/targets/${id}/imports/nmap`)).attach('file', await sample('zap-local.json'), 'zap.json');
      expect(wrong.status).toBe(400);
      expect(wrong.body.message).toMatch(/Nmap XML/);
      expect((await as(request(app).post(`/api/targets/${id}/imports/zap`))).status).toBe(400);
      const big = Buffer.alloc(6 * 1024 * 1024, 'a');
      expect((await as(request(app).post(`/api/targets/${id}/imports/zap`)).attach('file', big, 'big.json')).status).toBe(413);
    });

    it('raw output is assessor-only and 404s when missing', async () => {
      const id = await target();
      const queued = await as(request(app).post(`/api/targets/${id}/scans`)).send({ tool: 'DNS' });
      expect((await as(request(app).get(`/api/scans/${queued.body.data.scan.id}/raw`))).status).toBe(404);
      const viewer = await createUser('VIEWER');
      const viewerToken = (await login(app, viewer.email)).token;
      expect((await as(request(app).get(`/api/scans/${queued.body.data.scan.id}/raw`), viewerToken)).status).toBe(403);
      expect((await as(request(app).get(`/api/scans/${queued.body.data.scan.id}`), viewerToken)).status).toBe(200);
    });
  });

  afterAll(async () => {
    // Remove files this suite wrote under storage/targets.
    const scans = await prisma.scan.findMany({ where: { raw_output_path: { not: null } } });
    await Promise.all(scans.map((s) => storage.remove(s.raw_output_path ?? '')));
  });
});
