// Validates every environment variable the API needs at startup (AGENT.md §9).
// A missing or malformed value crashes the process with a clear message, never with a stack trace deep in a request.

import { parseAllowedHosts } from '@tanaw/shared';
import { z } from 'zod';

const duration = z.string().regex(/^\d+[smhd]$/, 'must look like 15m, 7d, 3600s');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('Tanaw'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_URL: z.url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(16, 'must be at least 16 characters').optional(),
  JWT_REFRESH_SECRET: z.string().min(16, 'must be at least 16 characters').optional(),
  JWT_ACCESS_TTL: duration.default('15m'),
  JWT_REFRESH_TTL: duration.default('7d'),

  ASSESSMENT_ALLOWED_HOSTS: z.string().default(''),

  AI_PROVIDER: z.enum(['openai', 'ollama']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),
  AI_DAILY_LIMIT: z.coerce.number().int().min(0).default(20),

  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  MAX_IMPORT_SIZE_MB: z.coerce.number().positive().max(50).default(5),
});

export type Env = z.infer<typeof EnvSchema> & { ALLOWED_HOSTS: string[] };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Treat empty strings as unset so `OPENAI_API_KEY=` in .env means "not configured".
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
