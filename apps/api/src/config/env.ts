// Validates every environment variable the API needs at startup (AGENT.md §9).
// A missing or malformed value crashes the process with a clear message, never with a stack trace deep in a request.

import { parseAllowedHosts } from '@tanaw/shared';
import { z } from 'zod';

const duration = z.string().regex(/^\d+[smhd]$/, 'must look like 15m, 7d, 3600s');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('Bai-Tanaw'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_URL: z.url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(16, 'must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'must be at least 16 characters'),
  JWT_ACCESS_TTL: duration.default('15m'),
  JWT_REFRESH_TTL: duration.default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  ASSESSMENT_ALLOWED_HOSTS: z.string().default(''),

  // Master key for secrets admins enter in Settings (the AI provider key). Losing or changing it means
  // re-entering those secrets; it never encrypts anything else.
  SETTINGS_ENCRYPTION_KEY: z.string().min(32, 'must be at least 32 characters (run npm run env:init)'),
  AI_DAILY_LIMIT: z.coerce.number().int().min(0).default(20),

  NMAP_DEFAULT_PORTS: z.string().default('80,443'),

  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  MAX_IMPORT_SIZE_MB: z.coerce.number().positive().max(50).default(5),
}).superRefine((e, ctx) => {
  if (e.NODE_ENV !== 'production') return;
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'SETTINGS_ENCRYPTION_KEY'] as const) {
    if (e[key].length < 32 || e[key].startsWith('change-me')) {
      ctx.addIssue({ code: 'custom', path: [key], message: 'production needs a random secret of 32+ characters' });
    }
  }
  if (e.JWT_ACCESS_SECRET === e.JWT_REFRESH_SECRET) {
    ctx.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'must differ from JWT_ACCESS_SECRET' });
  }
  if (e.BCRYPT_ROUNDS < 10) {
    ctx.addIssue({ code: 'custom', path: ['BCRYPT_ROUNDS'], message: 'production needs at least 10' });
  }
});

export type Env = z.infer<typeof EnvSchema> & { ALLOWED_HOSTS: string[] };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Treat empty strings as unset so `KEY=` in .env falls back to the default.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    // Startup failure: write directly, the logger may depend on env.
    process.stderr.write(`Invalid environment configuration:\n${lines.join('\n')}\n`);
    process.exit(1);
  }
  return { ...parsed.data, ALLOWED_HOSTS: parseAllowedHosts(parsed.data.ASSESSMENT_ALLOWED_HOSTS) };
}

export const env = loadEnv();
