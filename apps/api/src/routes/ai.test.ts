import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const enqueue = vi.fn(async (_type: string, jobId: string) => jobId);
vi.mock('../queues/assessment.queue.js', () => ({ enqueue, closeQueue: vi.fn() }));

const { createApp } = await import('../app.js');
const { env } = await import('../config/env.js');
const { prisma } = await import('../config/prisma.js');
const { startOfManilaDay } = await import('../services/ai.service.js');
const { createUser, hasTestDb, login, resetDb, setAiSettings } = await import('../test/helpers.js');

describe('startOfManilaDay', () => {
  it('is midnight in UTC+8', () => {
    expect(startOfManilaDay(new Date('2026-11-19T15:59:00Z')).toISOString()).toBe('2026-11-18T16:00:00.000Z');
    expect(startOfManilaDay(new Date('2026-11-19T16:00:00Z')).toISOString()).toBe('2026-11-19T16:00:00.000Z');
  });
});

describe.skipIf(!hasTestDb)('AI endpoints', () => {
  const app = createApp();
  const originalLimit = env.AI_DAILY_LIMIT;
  let token: string;
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    enqueue.mockClear();
    await setAiSettings();
    env.AI_DAILY_LIMIT = 20;
    const assessor = await createUser('ASSESSOR');
    userId = assessor.id;
    token = (await login(app, assessor.email)).token;
  });
  afterEach(() => {
    env.AI_DAILY_LIMIT = originalLimit;
  });
  afterAll(() => prisma.$disconnect());

  const as = (req: request.Test, bearer = token) => req.set('authorization', `Bearer ${bearer}`);

  async function doneScan(status: 'DONE' | 'RUNNING' = 'DONE', withResults = true) {
    const target = await prisma.assessmentTarget.create({ data: { name: 'Bayaw', base_url: 'https://bayawjobs.riomar.dev' } });
    const scan = await prisma.scan.create({ data: { target_id: target.id, tool: 'HTTP_CHECK', source: 'WORKER', status } });
    if (withResults) {
      await prisma.scanResult.create({ data: { scan_id: scan.id, type: 'HEADER', data: { check: 'response', url: target.base_url, status: 200, location: null } } });
    }
    return { target, scan };
  }

  it('queues an interpretation (202) and audits it', async () => {
    const { scan } = await doneScan();
    const res = await as(request(app).post(`/api/scans/${scan.id}/interpret`));
    expect(res.status).toBe(202);
    expect(res.body.data.job).toMatchObject({ type: 'INTERPRET', ref_id: scan.id, status: 'WAITING', created_by: userId });
    expect(enqueue).toHaveBeenCalledWith('INTERPRET', res.body.data.job.id);
    expect(await prisma.auditLog.count({ where: { action: 'ai_requested' } })).toBe(1);
  });

  it('returns 503 when no AI provider is configured, before queueing anything', async () => {
    await setAiSettings('openrouter', null);
    const { scan } = await doneScan();
    const res = await as(request(app).post(`/api/scans/${scan.id}/interpret`));
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/Settings/);
    expect(enqueue).not.toHaveBeenCalled();
    expect(await prisma.job.count()).toBe(0);
  });

  it('returns 503 when the stored key can no longer be decrypted', async () => {
    const { scan } = await doneScan();
    await prisma.appSetting.update({ where: { key: 'ai' }, data: { secret: 'v1.AAAA.AAAA.AAAA.AAAA' } });
    const res = await as(request(app).post(`/api/scans/${scan.id}/interpret`));
    expect(res.status).toBe(503);
  });

  it('needs no key for Ollama', async () => {
    await setAiSettings('ollama', null);
    const { scan } = await doneScan();
    expect((await as(request(app).post(`/api/scans/${scan.id}/interpret`))).status).toBe(202);
  });

  it('enforces the daily AI cap per user with 429', async () => {
    env.AI_DAILY_LIMIT = 2;
    const { scan } = await doneScan();
    expect((await as(request(app).post(`/api/scans/${scan.id}/interpret`))).status).toBe(202);
    expect((await as(request(app).post(`/api/scans/${scan.id}/interpret`))).status).toBe(202);
    const third = await as(request(app).post(`/api/scans/${scan.id}/interpret`));
    expect(third.status).toBe(429);
    expect(third.body.message).toMatch(/Daily AI limit/);

    const usage = await as(request(app).get('/api/ai/usage'));
    expect(usage.body.data).toEqual({ used: 2, limit: 2, remaining: 0, configured: true });

    // Another assessor has their own allowance.
    const other = await createUser('ASSESSOR');
    const otherToken = (await login(app, other.email)).token;
    expect((await as(request(app).post(`/api/scans/${scan.id}/interpret`), otherToken)).status).toBe(202);
  });

  it('refuses unfinished or empty scans with 400 and unknown scans with 404', async () => {
    const running = await doneScan('RUNNING');
    expect((await as(request(app).post(`/api/scans/${running.scan.id}/interpret`))).status).toBe(400);
    const empty = await doneScan('DONE', false);
    expect((await as(request(app).post(`/api/scans/${empty.scan.id}/interpret`))).status).toBe(400);
    expect((await as(request(app).post('/api/scans/00000000-0000-4000-8000-000000000000/interpret'))).status).toBe(404);
  });

  it('viewers can read AI analyses but cannot spend AI calls', async () => {
    const { scan } = await doneScan();
    await prisma.aiAnalysis.create({
      data: { scan_id: scan.id, task: 'INTERPRET', provider: 'openai', model: 'gpt-test', input_hash: 'h', output: { findings: [] }, created_by: userId },
    });
    const viewer = await createUser('VIEWER');
    const viewerToken = (await login(app, viewer.email)).token;
    expect((await as(request(app).post(`/api/scans/${scan.id}/interpret`), viewerToken)).status).toBe(403);
    const list = await as(request(app).get(`/api/scans/${scan.id}/ai`), viewerToken);
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({ task: 'INTERPRET', model: 'gpt-test', creator: { id: userId } });
  });

  it('queues a remediation draft for a finding and lists drafts', async () => {
    const { target, scan } = await doneScan();
    const finding = await prisma.finding.create({
      data: { target_id: target.id, scan_id: scan.id, title: 'Missing HSTS', category: 'SECURITY_CONFIG', description: 'No HSTS header.', affected_asset: target.base_url, source: 'AI' },
    });
    const res = await as(request(app).post(`/api/findings/${finding.id}/remediation`));
    expect(res.status).toBe(202);
    expect(res.body.data.job).toMatchObject({ type: 'REMEDIATE', ref_id: finding.id });
    expect((await as(request(app).get(`/api/findings/${finding.id}/ai`))).body.data).toEqual([]);
    expect((await as(request(app).post('/api/findings/00000000-0000-4000-8000-000000000000/remediation'))).status).toBe(404);
  });
});
