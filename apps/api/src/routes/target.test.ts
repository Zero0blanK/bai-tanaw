import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.js';
import { targetService } from '../services/target.service.js';
import { createUser, hasTestDb, login, resetDb } from '../test/helpers.js';

const BASE = 'https://bayawjobs.riomar.dev';

describe.skipIf(!hasTestDb)('targets and scope', () => {
  const app = createApp();
  let assessorId: string;
  let token: string;

  beforeEach(async () => {
    await resetDb();
    const assessor = await createUser('ASSESSOR');
    assessorId = assessor.id;
    token = (await login(app, assessor.email)).token;
  });
  afterAll(() => prisma.$disconnect());

  const as = (req: request.Test, bearer = token) => req.set('authorization', `Bearer ${bearer}`);

  async function createTarget(body: Record<string, unknown> = {}) {
    const res = await as(request(app).post('/api/targets')).send({ name: 'Bayaw Jobs', base_url: `${BASE}/`, ...body });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; base_url: string };
  }

  async function addRule(targetId: string, rule: Record<string, unknown>) {
    return as(request(app).post(`/api/targets/${targetId}/scope`)).send(rule);
  }

  async function scopeBlocks() {
    return prisma.auditLog.findMany({ where: { action: 'scope_blocked' }, orderBy: { created_at: 'asc' } });
  }

  describe('targets', () => {
    it('registers an allowlisted target with a normalized base URL', async () => {
      const target = await createTarget({ authorization_note: 'Written approval from the instructor, 2026-11-10' });
      expect(target.base_url).toBe(BASE);
      const row = await prisma.assessmentTarget.findUniqueOrThrow({ where: { id: target.id } });
      expect(row.created_by).toBe(assessorId);
      expect(await prisma.auditLog.count({ where: { action: 'target_created', target_id: target.id } })).toBe(1);
    });

    it('refuses hosts that are not on the allowlist with 403 and audits it', async () => {
      const res = await as(request(app).post('/api/targets')).send({ name: 'Not ours', base_url: 'https://example.com' });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/allowlist/);
      expect(await prisma.assessmentTarget.count()).toBe(0);
      const [block] = await scopeBlocks();
      expect(block).toMatchObject({ actor_id: assessorId });
      expect(block?.metadata).toMatchObject({ context: 'target_create', host: 'example.com' });
    });

    it('rejects non-http URLs, credentials in URLs and backwards test windows with 400', async () => {
      for (const base_url of ['file:///etc/passwd', 'https://u:p@bayawjobs.riomar.dev', 'not a url']) {
        expect((await as(request(app).post('/api/targets')).send({ name: 'X target', base_url })).status).toBe(400);
      }
      const res = await as(request(app).post('/api/targets')).send({
        name: 'Window',
        base_url: BASE,
        test_window_start: '2026-12-10',
        test_window_end: '2026-12-01',
      });
      expect(res.status).toBe(400);
    });

    it('lists and shows targets to every role, but only assessors can change them', async () => {
      const target = await createTarget();
      const viewer = await createUser('VIEWER');
      const viewerToken = (await login(app, viewer.email)).token;

      const list = await as(request(app).get('/api/targets'), viewerToken);
      expect(list.status).toBe(200);
      expect(list.body.data[0]).toMatchObject({ id: target.id, _count: { scope_rules: 0 } });
      expect((await as(request(app).get(`/api/targets/${target.id}`), viewerToken)).status).toBe(200);

      expect((await as(request(app).post('/api/targets'), viewerToken).send({ name: 'V', base_url: BASE })).status).toBe(403);
      expect((await as(request(app).patch(`/api/targets/${target.id}`), viewerToken).send({ name: 'Nope' })).status).toBe(403);
      expect((await as(request(app).post(`/api/targets/${target.id}/scope`), viewerToken).send({ asset_type: 'PORT_RANGE', value: '443' })).status).toBe(403);
      expect((await request(app).get('/api/targets')).status).toBe(401);
    });

    it('updates details but never the base URL', async () => {
      const target = await createTarget();
      const res = await as(request(app).patch(`/api/targets/${target.id}`)).send({
        name: 'Bayaw Jobs (prod)',
        base_url: 'https://example.com',
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ name: 'Bayaw Jobs (prod)', base_url: BASE });
    });

    it('returns 404 for unknown targets and 400 for malformed ids', async () => {
      expect((await as(request(app).get('/api/targets/00000000-0000-4000-8000-000000000000'))).status).toBe(404);
      expect((await as(request(app).get('/api/targets/abc'))).status).toBe(400);
    });
  });

  describe('scope rules', () => {
    it('adds and deletes rules, normalizing values', async () => {
      const target = await createTarget();
      const host = await addRule(target.id, { asset_type: 'HOST', value: 'BayawJobs-API.riomar.dev' });
      expect(host.status).toBe(201);
      expect(host.body.data).toMatchObject({ value: 'bayawjobs-api.riomar.dev', in_scope: true });

      const ports = await addRule(target.id, { asset_type: 'PORT_RANGE', value: '80, 443' });
      expect(ports.body.data.value).toBe('80,443');

      const detail = await as(request(app).get(`/api/targets/${target.id}`));
      expect(detail.body.data.scope_rules).toHaveLength(2);

      const del = await as(request(app).delete(`/api/targets/${target.id}/scope/${host.body.data.id}`));
      expect(del.status).toBe(200);
      expect(await prisma.scopeRule.count()).toBe(1);
      const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map((r) => r.action);
      expect(actions).toEqual(expect.arrayContaining(['scope_rule_added', 'scope_rule_deleted']));
    });

    it('never lets an in-scope HOST or URL rule widen past the allowlist', async () => {
      const target = await createTarget();
      expect((await addRule(target.id, { asset_type: 'HOST', value: 'evil.com' })).status).toBe(403);
      expect((await addRule(target.id, { asset_type: 'URL', value: 'https://evil.com/api' })).status).toBe(403);
      expect(await prisma.scopeRule.count()).toBe(0);
      expect(await scopeBlocks()).toHaveLength(2);
    });

    it('allows out-of-scope rules for any host (they only ever narrow scope)', async () => {
      const target = await createTarget();
      const res = await addRule(target.id, { asset_type: 'HOST', value: 'cdn.example.com', in_scope: false });
      expect(res.status).toBe(201);
    });

    it('validates rule values', async () => {
      const target = await createTarget();
      expect((await addRule(target.id, { asset_type: 'PORT_RANGE', value: '1-70000' })).status).toBe(400);
      expect((await addRule(target.id, { asset_type: 'URL', value: 'ftp://bayawjobs.riomar.dev' })).status).toBe(400);
      expect((await addRule(target.id, { asset_type: 'HOST', value: 'a b' })).status).toBe(400);
      expect((await addRule(target.id, { asset_type: 'SUBNET', value: '10.0.0.0/8' })).status).toBe(400);
    });

    it("can't delete a rule through another target", async () => {
      const a = await createTarget();
      const b = await createTarget({ name: 'Second' });
      const rule = await addRule(a.id, { asset_type: 'PORT_RANGE', value: '443' });
      expect((await as(request(app).delete(`/api/targets/${b.id}/scope/${rule.body.data.id}`))).status).toBe(404);
      expect(await prisma.scopeRule.count()).toBe(1);
    });
  });

  describe('scope enforcement against a stored target', () => {
    const actor = () => ({ id: assessorId, ip: '127.0.0.1' });

    async function expectBlocked(targetId: string, req: { url?: string; host?: string; port?: number }, reason: RegExp) {
      await expect(targetService.assertInScope(targetId, req, actor(), 'scan')).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringMatching(reason),
      });
    }

    it('rule 1: blocks hosts off the allowlist, including SSRF targets', async () => {
      const target = await createTarget();
      await expectBlocked(target.id, { url: 'http://169.254.169.254/latest/meta-data' }, /allowlist/);
      await expectBlocked(target.id, { host: 'bayawjobs.riomar.dev.evil.com' }, /allowlist/);
    });

    it('rule 2: out-of-scope rules always win', async () => {
      const target = await createTarget();
      await addRule(target.id, { asset_type: 'URL', value: `${BASE}/admin`, in_scope: false });
      await addRule(target.id, { asset_type: 'PORT_RANGE', value: '22', in_scope: false });
      await expectBlocked(target.id, { url: `${BASE}/admin/users` }, /out-of-scope prefix/);
      await expectBlocked(target.id, { host: 'bayawjobs.riomar.dev', port: 22 }, /out of scope/);
      await expect(targetService.assertInScope(target.id, { url: `${BASE}/jobs` }, actor(), 'scan')).resolves.toBeDefined();
    });

    it('rule 3: allowlisted hosts must still belong to the target', async () => {
      const target = await createTarget();
      await expectBlocked(target.id, { host: 'bayawjobs-api.riomar.dev' }, /not in scope for this target/);
      await addRule(target.id, { asset_type: 'HOST', value: 'bayawjobs-api.riomar.dev' });
      await expect(
        targetService.assertInScope(target.id, { host: 'bayawjobs-api.riomar.dev' }, actor(), 'scan'),
      ).resolves.toBeDefined();
    });

    it('rule 4: in-scope port ranges restrict ports', async () => {
      const target = await createTarget();
      await addRule(target.id, { asset_type: 'PORT_RANGE', value: '443' });
      await expectBlocked(target.id, { url: 'http://bayawjobs.riomar.dev/' }, /port 80/);
      await expect(targetService.assertInScope(target.id, { url: `${BASE}/` }, actor(), 'scan')).resolves.toBeDefined();
    });

    it('rule 5: in-scope URL rules restrict paths on that host', async () => {
      const target = await createTarget();
      await addRule(target.id, { asset_type: 'URL', value: `${BASE}/api` });
      await expectBlocked(target.id, { url: `${BASE}/other` }, /in-scope URL rule/);
      await expect(targetService.assertInScope(target.id, { url: `${BASE}/api/jobs` }, actor(), 'scan')).resolves.toBeDefined();
    });

    it('writes one scope_blocked audit row per block, with the reason', async () => {
      const target = await createTarget();
      await expectBlocked(target.id, { host: 'example.com' }, /allowlist/);
      const [block] = await scopeBlocks();
      expect(block).toMatchObject({ target_id: target.id, actor_id: assessorId, ip: '127.0.0.1' });
      expect(block?.metadata).toMatchObject({ context: 'scan', request: { host: 'example.com' } });
    });

    it('POST /scope/check answers without auditing', async () => {
      const target = await createTarget();
      const blocked = await as(request(app).post(`/api/targets/${target.id}/scope/check`)).send({ host: 'example.com' });
      expect(blocked.status).toBe(200);
      expect(blocked.body.data).toMatchObject({ ok: false, reason: expect.stringMatching(/allowlist/) });
      const allowed = await as(request(app).post(`/api/targets/${target.id}/scope/check`)).send({ url: `${BASE}/login` });
      expect(allowed.body.data).toEqual({ ok: true });
      expect(await scopeBlocks()).toHaveLength(0);
      expect((await as(request(app).post(`/api/targets/${target.id}/scope/check`)).send({})).status).toBe(400);
    });
  });
});
