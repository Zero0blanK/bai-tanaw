// Validates every environment variable the worker needs at startup.

import { parseAllowedHosts } from '@tanaw/shared';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),

  ASSESSMENT_ALLOWED_HOSTS: z.string().default(''),

  NMAP_BIN: z.string().default('nmap'),
  NMAP_DEFAULT_PORTS: z.string().default('80,443'),
  TOOL_TIMEOUT_MS: z.coerce.number().int().min(1000).default(900_000),
  ZAP_API_URL: z.url().default('http://localhost:8090'),
  ZAP_API_KEY: z.string().optional(),
  ZAP_ACTIVE_SCAN_ENABLED: bool,
  /** Upper bound for one ZAP spider run, in minutes. */
  ZAP_SPIDER_MAX_MINUTES: z.coerce.number().int().min(1).max(60).default(5),

  // Provider, model and API key are set by an admin in Settings (app_settings, key encrypted with this).
  SETTINGS_ENCRYPTION_KEY: z.string().min(32, 'must be at least 32 characters (run npm run env:init)'),
  OLLAMA_URL: z.url().default('http://localhost:11434'),
  /** Same cap as the API: AI jobs per user per day (Philippine time). Automatic interpretations count too. */
  AI_DAILY_LIMIT: z.coerce.number().int().min(0).default(20),
  AI_MAX_INPUT_CHARS: z.coerce.number().int().min(1000).max(100_000).default(12_000),

  STORAGE_LOCAL_DIR: z.string().default('./storage'),
}).superRefine((e, ctx) => {
  if (e.NODE_ENV === 'production' && e.SETTINGS_ENCRYPTION_KEY.startsWith('change-me')) {
    ctx.addIssue({ code: 'custom', path: ['SETTINGS_ENCRYPTION_KEY'], message: 'production needs a random secret (run npm run env:init)' });
  }
});

export type Env = z.infer<typeof EnvSchema> & { ALLOWED_HOSTS: string[] };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    process.stderr.write(`Invalid environment configuration:\n${lines.join('\n')}\n`);
    process.exit(1);
  }
  return { ...parsed.data, ALLOWED_HOSTS: parseAllowedHosts(parsed.data.ASSESSMENT_ALLOWED_HOSTS) };
}

export const env = loadEnv();
