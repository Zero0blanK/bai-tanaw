import type { AiProvider, Role } from '@tanaw/shared';
import { AI_SETTINGS_KEY, encryptAiKey } from '@tanaw/shared/node';
import type { Express } from 'express';
import request from 'supertest';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { hashPassword } from '../utils/crypto.js';

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);
export const PASSWORD = 'Test-Password-123!';

/** Empties every table (keeps the migrations table). */
export async function resetDb(): Promise<void> {
  if (!/test/i.test(new URL(process.env.DATABASE_URL ?? 'postgresql://x/none').pathname)) {
    throw new Error('Refusing to empty a database whose name does not contain "test".');
  }
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

let counter = 0;
export async function createUser(role: Role, overrides: { email?: string; is_active?: boolean } = {}) {
  counter += 1;
  return prisma.user.create({
    data: {
      email: overrides.email ?? `${role.toLowerCase()}${counter}@tanaw.test`,
      name: `${role} ${counter}`,
      role,
      is_active: overrides.is_active ?? true,
      password_hash: await hashPassword(PASSWORD),
    },
  });
}

export function refreshCookieFrom(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  return cookies.find((c) => c.startsWith('tanaw_refresh='));
}

/** Logs in and returns the bearer token and the refresh cookie pair ("tanaw_refresh=..."). */
export async function login(app: Express, email: string, password = PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed (${res.status}): ${JSON.stringify(res.body)}`);
  const cookie = refreshCookieFrom(res)?.split(';')[0];
  return { token: res.body.data.access_token as string, cookie: cookie ?? '', res };
}

export async function auditActions(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({ orderBy: { created_at: 'asc' }, select: { action: true } });
  return rows.map((r) => r.action);
}

/** Stores AI settings the way the Settings page does (key encrypted). Pass no key to leave it unset. */
export async function setAiSettings(provider: AiProvider = 'openrouter', apiKey: string | null = 'sk-or-v1-test-not-real-0000000000') {
  const data = {
    value: { provider, model: 'openai/gpt-4.1-mini' },
    secret: apiKey ? encryptAiKey(apiKey, env.SETTINGS_ENCRYPTION_KEY) : null,
    secret_hint: apiKey ? `…${apiKey.slice(-4)}` : null,
  };
  await prisma.appSetting.upsert({ where: { key: AI_SETTINGS_KEY }, create: { key: AI_SETTINGS_KEY, ...data }, update: data });
}
