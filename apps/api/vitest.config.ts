import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// Load the repo-root .env (for TEST_DATABASE_URL), but never let tests touch the dev database.
const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: { conditions: ['development'] },
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/test/globalSetup.ts'],
    // DB tests share one database: run files one after another.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      // Placeholder when no test DB is configured: Prisma connects lazily, and DB suites skip themselves.
      DATABASE_URL: testDatabaseUrl ?? 'postgresql://unused:unused@localhost:1/unused',
      TEST_DATABASE_URL: testDatabaseUrl ?? '',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef',
      BCRYPT_ROUNDS: '4',
      CORS_ORIGIN: 'http://localhost:3000',
      STORAGE_LOCAL_DIR: join(tmpdir(), 'tanaw-api-test-storage'),
      ASSESSMENT_ALLOWED_HOSTS: 'bayawjobs.riomar.dev,bayawjobs-api.riomar.dev,localhost,127.0.0.1',
    },
  },
});
