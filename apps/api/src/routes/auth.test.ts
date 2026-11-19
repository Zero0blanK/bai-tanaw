import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.js';
import { auditActions, createUser, hasTestDb, login, PASSWORD, refreshCookieFrom, resetDb } from '../test/helpers.js';

describe.skipIf(!hasTestDb)('auth', () => {
  let app = createApp();

  beforeEach(async () => {
    await resetDb();
    app = createApp();
  });
  afterAll(() => prisma.$disconnect());

  describe('POST /api/auth/login', () => {
    it('signs in, returns an access token and sets a locked-down refresh cookie', async () => {
      const user = await createUser('ASSESSOR');
      const { res } = await login(app, user.email);
      expect(res.body.data.access_token).toEqual(expect.any(String));
      expect(res.body.data.user).toMatchObject({ email: user.email, role: 'ASSESSOR' });
      expect(res.body.data.user.password_hash).toBeUndefined();

      const cookie = refreshCookieFrom(res) ?? '';
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/auth/);

      const stored = await prisma.refreshToken.findFirstOrThrow({ where: { user_id: user.id } });
      expect(cookie).not.toContain(stored.token_hash);
      expect(await auditActions()).toContain('login_success');
    });

    it('gives the same 401 for a wrong password and an unknown email', async () => {
      const user = await createUser('VIEWER');
      const wrong = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Nope-12345678!' });
      const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@tanaw.test', password: PASSWORD });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body.message).toBe(unknown.body.message);
      expect(await auditActions()).toEqual(['login_failed', 'login_failed']);
    });

    it('rejects a malformed body with 400', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(expect.any(Array));
    });

    it('locks the account after 5 failed logins, even for the right password, then unlocks', async () => {
      const user = await createUser('ASSESSOR');
      for (let i = 0; i < 5; i += 1) {
        const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Wrong-Pass-123!' });
        expect(res.status).toBe(401);
      }
      const locked = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
      expect(locked.status).toBe(429);
      expect(await auditActions()).toContain('login_locked');

      await prisma.user.update({ where: { id: user.id }, data: { locked_until: new Date(Date.now() - 1000) } });
      const { res } = await login(app, user.email);
      expect(res.status).toBe(200);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.failed_login_attempts).toBe(0);
      expect(after.locked_until).toBeNull();
    });

    it('refuses deactivated accounts', async () => {
      const user = await createUser('ASSESSOR', { is_active: false });
      const res = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
      expect(res.status).toBe(401);
    });

    it('rate-limits login attempts per IP', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 21; i += 1) {
        const res = await request(app).post('/api/auth/login').send({ email: `x${i}@tanaw.test`, password: 'whatever' });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
      expect(statuses[20]).toBe(429);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the current user with a valid token', async () => {
      const user = await createUser('VIEWER');
      const { token } = await login(app, user.email);
      const res = await request(app).get('/api/auth/me').set('authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: user.id, email: user.email });
    });

    it('rejects missing, garbage, foreign-signed and alg:none tokens', async () => {
      const user = await createUser('ADMIN');
      const forged = jwt.sign({ role: 'ADMIN' }, 'some-other-secret-0123456789', {
        subject: user.id,
        issuer: 'tanaw-api',
        audience: 'tanaw-web',
      });
      const none = jwt.sign({ role: 'ADMIN', sub: user.id, iss: 'tanaw-api', aud: 'tanaw-web' }, '', { algorithm: 'none' });
      for (const header of [undefined, 'Bearer garbage', `Bearer ${forged}`, `Bearer ${none}`, 'Basic abc']) {
        const req = request(app).get('/api/auth/me');
        const res = await (header ? req.set('authorization', header) : req);
        expect(res.status).toBe(401);
      }
    });

    it('stops accepting a token as soon as the user is deactivated', async () => {
      const user = await createUser('ASSESSOR');
      const { token } = await login(app, user.email);
      await prisma.user.update({ where: { id: user.id }, data: { is_active: false } });
      const res = await request(app).get('/api/auth/me').set('authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });
  });

  describe('refresh and logout', () => {
    it('rotates the refresh token', async () => {
      const user = await createUser('ASSESSOR');
      const { cookie } = await login(app, user.email);
      const res = await request(app).post('/api/auth/refresh').set('cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data.access_token).toEqual(expect.any(String));
      const next = refreshCookieFrom(res)?.split(';')[0];
      expect(next).toBeDefined();
      expect(next).not.toBe(cookie);
    });

    it('treats reuse of a rotated token as theft and revokes every session', async () => {
      const user = await createUser('ASSESSOR');
      const { cookie: first } = await login(app, user.email);
      const rotated = await request(app).post('/api/auth/refresh').set('cookie', first);
      const second = refreshCookieFrom(rotated)?.split(';')[0] ?? '';

      const replay = await request(app).post('/api/auth/refresh').set('cookie', first);
      expect(replay.status).toBe(401);
      expect(await auditActions()).toContain('refresh_reuse_detected');

      const afterTheft = await request(app).post('/api/auth/refresh').set('cookie', second);
      expect(afterTheft.status).toBe(401);
    });

    it('rejects a missing or unknown refresh cookie', async () => {
      expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
      expect((await request(app).post('/api/auth/refresh').set('cookie', 'tanaw_refresh=bogus')).status).toBe(401);
    });

    it('logout revokes the session and clears the cookie', async () => {
      const user = await createUser('VIEWER');
      const { cookie } = await login(app, user.email);
      const out = await request(app).post('/api/auth/logout').set('cookie', cookie);
      expect(out.status).toBe(200);
      expect(refreshCookieFrom(out)).toMatch(/tanaw_refresh=;/);
      expect((await request(app).post('/api/auth/refresh').set('cookie', cookie)).status).toBe(401);
      expect(await auditActions()).toContain('logout');
    });
  });
});
