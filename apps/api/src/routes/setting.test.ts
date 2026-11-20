import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.js';
import { settingService } from '../services/setting.service.js';
import { auditActions, createUser, hasTestDb, login, resetDb } from '../test/helpers.js';

const KEY = 'sk-or-v1-0123456789abcdef0123456789abcdef9f3a';

describe.skipIf(!hasTestDb)('AI settings', () => {
  let app = createApp();
  let admin: string;

  beforeEach(async () => {
    await resetDb();
    app = createApp();
    const user = await createUser('ADMIN');
    admin = (await login(app, user.email)).token;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  const as = (req: request.Test, bearer = admin) => req.set('authorization', `Bearer ${bearer}`);

  it('starts on OpenRouter with no key', async () => {
    const res = await as(request(app).get('/api/settings/ai'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ provider: 'openrouter', needs_key: true, key_stored: false, key_hint: null, configured: false });
  });

  it('stores the key encrypted, never returns it, and audits without it', async () => {
    const res = await as(request(app).put('/api/settings/ai')).send({ provider: 'openrouter', model: 'openai/gpt-4.1-mini', api_key: KEY });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ key_stored: true, key_hint: '…9f3a', configured: true });
    expect(JSON.stringify(res.body)).not.toContain(KEY);

    const row = await prisma.appSetting.findUniqueOrThrow({ where: { key: 'ai' } });
    expect(row.secret).toMatch(/^v1\./);
    expect(row.secret).not.toContain(KEY);
    expect(JSON.stringify(row)).not.toContain(KEY.slice(0, 20));

    const get = await as(request(app).get('/api/settings/ai'));
    expect(JSON.stringify(get.body)).not.toContain(KEY);
    expect((await settingService.resolveAi()).apiKey).toBe(KEY);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'settings_updated' } });
    expect(log.metadata).toMatchObject({ setting: 'ai', provider: 'openrouter', key: 'set' });
    expect(JSON.stringify(log)).not.toContain(KEY);
  });

  it('keeps the stored key when only the model changes, and clears it on request', async () => {
    await as(request(app).put('/api/settings/ai')).send({ provider: 'openrouter', model: 'openai/gpt-4.1-mini', api_key: KEY });
    const before = await prisma.appSetting.findUniqueOrThrow({ where: { key: 'ai' } });

    const keep = await as(request(app).put('/api/settings/ai')).send({ provider: 'openrouter', model: 'anthropic/claude-sonnet-4' });
    expect(keep.body.data).toMatchObject({ model: 'anthropic/claude-sonnet-4', key_stored: true });
    expect((await prisma.appSetting.findUniqueOrThrow({ where: { key: 'ai' } })).secret).toBe(before.secret);

    const cleared = await as(request(app).put('/api/settings/ai')).send({ provider: 'openrouter', model: 'anthropic/claude-sonnet-4', clear_key: true });
    expect(cleared.body.data).toMatchObject({ key_stored: false, configured: false });
    expect(await auditActions()).toEqual(expect.arrayContaining(['settings_updated']));
  });

  it('validates the body', async () => {
    const bad = [
      { provider: 'anthropic', model: 'x' },
      { provider: 'openrouter', model: 'has spaces' },
      { provider: 'openrouter', model: 'm', api_key: 'short' },
      { provider: 'openrouter', model: 'm', api_key: 'sk-or-v1 with spaces inside it' },
      { provider: 'openrouter', model: 'm', api_key: KEY, clear_key: true },
    ];
    for (const body of bad) expect((await as(request(app).put('/api/settings/ai')).send(body)).status).toBe(400);
  });

  it('is admin-only', async () => {
    const assessor = await createUser('ASSESSOR');
    const token = (await login(app, assessor.email)).token;
    expect((await as(request(app).get('/api/settings/ai'), token)).status).toBe(403);
    expect((await as(request(app).put('/api/settings/ai'), token).send({ provider: 'ollama', model: 'llama3.1:8b' })).status).toBe(403);
    expect((await request(app).get('/api/settings/ai')).status).toBe(401);
  });

  it('tests the key against the provider without sending it anywhere else', async () => {
    expect((await as(request(app).post('/api/settings/ai/test'))).body.data).toMatchObject({ ok: false });

    await as(request(app).put('/api/settings/ai')).send({ provider: 'openrouter', model: 'openai/gpt-4.1-mini', api_key: KEY });
    const calls: Array<{ url: string; auth: string | null }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push({ url: String(url), auth: new Headers(init?.headers).get('authorization') });
      return Response.json({ data: { label: 'test' } });
    });
    const ok = await as(request(app).post('/api/settings/ai/test'));
    expect(ok.body.data).toMatchObject({ ok: true });
    expect(calls).toEqual([{ url: 'https://openrouter.ai/api/v1/key', auth: `Bearer ${KEY}` }]);
    expect(JSON.stringify(ok.body)).not.toContain(KEY);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
    expect((await as(request(app).post('/api/settings/ai/test'))).body.data).toMatchObject({ ok: false, detail: expect.stringMatching(/rejected/) });
  });
});
