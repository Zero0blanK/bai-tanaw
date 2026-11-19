import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// Same test database as the API (apps/api runs `prisma migrate deploy` on it; we run it here too).
const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: { conditions: ['development'] },
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/test/globalSetup.ts'],
    fileParallelism: false,
    passWithNoTests: true,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl ?? 'postgresql://unused:unused@localhost:1/unused',
      TEST_DATABASE_URL: testDatabaseUrl ?? '',
      ASSESSMENT_ALLOWED_HOSTS: 'bayawjobs.riomar.dev,bayawjobs-api.riomar.dev,localhost,127.0.0.1',
      STORAGE_LOCAL_DIR: join(tmpdir(), 'tanaw-worker-test-storage'),
      NMAP_BIN: 'nmap-not-used-in-tests',
    },
  },
});
