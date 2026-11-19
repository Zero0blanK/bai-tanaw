import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.js';
import { auditActions, createUser, hasTestDb, login, resetDb } from '../test/helpers.js';

describe.skipIf(!hasTestDb)('users admin and audit log', () => {
  const app = createApp();
  let adminId: string;
  let adminToken: string;

  beforeEach(async () => {
    await resetDb();
    const admin = await createUser('ADMIN');
    adminId = admin.id;
    adminToken = (await login(app, admin.email)).token;
  });
  afterAll(() => prisma.$disconnect());

  const asAdmin = (req: request.Test) => req.set('authorization', `Bearer ${adminToken}`);

  it('only admins can reach /api/users', async () => {
    expect((await request(app).get('/api/users')).status).toBe(401);
    for (const role of ['ASSESSOR', 'VIEWER'] as const) {
      const user = await createUser(role);
      const { token } = await login(app, user.email);
      const res = await request(app).get('/api/users').set('authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it('creates a user, rejects duplicates and weak passwords', async () => {
    const body = { email: 'New.Assessor@Tanaw.test', name: 'New Assessor', password: 'Str0ng-Passw0rd!', role: 'ASSESSOR' };
    const res = await asAdmin(request(app).post('/api/users')).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'new.assessor@tanaw.test', role: 'ASSESSOR', is_active: true });
    expect(res.body.data.password_hash).toBeUndefined();

    expect((await asAdmin(request(app).post('/api/users')).send(body)).status).toBe(409);
    const weak = await asAdmin(request(app).post('/api/users')).send({ ...body, email: 'b@tanaw.test', password: 'short' });
    expect(weak.status).toBe(400);
    expect(await auditActions()).toContain('user_created');

    // The new account can sign in.
    expect((await login(app, 'new.assessor@tanaw.test', 'Str0ng-Passw0rd!')).res.status).toBe(200);
  });

  it('lists users with pagination and no password hashes', async () => {
    await createUser('VIEWER');
    await createUser('ASSESSOR');
    const res = await asAdmin(request(app).get('/api/users?page=1&limit=2'));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, total_pages: 2 });
    expect(JSON.stringify(res.body)).not.toContain('password_hash');
  });

  it('changes a role and signs that user out everywhere', async () => {
    const user = await createUser('ASSESSOR');
    const { cookie } = await login(app, user.email);
    const res = await asAdmin(request(app).patch(`/api/users/${user.id}`)).send({ role: 'VIEWER' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('VIEWER');
    expect((await request(app).post('/api/auth/refresh').set('cookie', cookie)).status).toBe(401);
  });

  it('protects the admin from locking themselves out', async () => {
    expect((await asAdmin(request(app).patch(`/api/users/${adminId}`)).send({ role: 'VIEWER' })).status).toBe(400);
    expect((await asAdmin(request(app).patch(`/api/users/${adminId}`)).send({ is_active: false })).status).toBe(400);
    expect((await asAdmin(request(app).delete(`/api/users/${adminId}`))).status).toBe(400);
    // Renaming yourself is fine.
    expect((await asAdmin(request(app).patch(`/api/users/${adminId}`)).send({ name: 'Renamed Admin' })).status).toBe(200);
  });

  it('lets one admin demote another, and the demoted admin loses access at once', async () => {
    const other = await createUser('ADMIN');
    const otherToken = (await login(app, other.email)).token;
    const demote = await request(app)
      .patch(`/api/users/${adminId}`)
      .set('authorization', `Bearer ${otherToken}`)
      .send({ role: 'ASSESSOR' });
    expect(demote.status).toBe(200);
    // The old token still carries role ADMIN, but roles are re-read on every request.
    expect((await asAdmin(request(app).get('/api/users'))).status).toBe(403);
  });

  it('deletes another user and returns 404 for unknown ids', async () => {
    const user = await createUser('VIEWER');
    expect((await asAdmin(request(app).delete(`/api/users/${user.id}`))).status).toBe(200);
    expect((await asAdmin(request(app).delete(`/api/users/${user.id}`))).status).toBe(404);
    expect((await asAdmin(request(app).delete('/api/users/not-a-uuid'))).status).toBe(400);
    expect(await auditActions()).toContain('user_deleted');
  });

  it('GET /api/audit-logs is admin-only and newest first', async () => {
    const res = await asAdmin(request(app).get('/api/audit-logs?action=login_success'));
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ action: 'login_success', actor: { id: adminId } });

    const viewer = await createUser('VIEWER');
    const { token } = await login(app, viewer.email);
    expect((await request(app).get('/api/audit-logs').set('authorization', `Bearer ${token}`)).status).toBe(403);
  });
});
