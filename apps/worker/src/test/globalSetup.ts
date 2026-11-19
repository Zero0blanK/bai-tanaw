// Brings the shared test database up to date with `prisma migrate deploy` (non-destructive).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    process.stderr.write('TEST_DATABASE_URL not set: skipping database tests.\n');
    return;
  }
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error('TEST_DATABASE_URL must point at a database whose name contains "test" (it gets wiped).');
  }
  const require = createRequire(import.meta.url);
  const cli = require.resolve('prisma/build/index.js');
  const schema = new URL('../../../api/prisma/schema.prisma', import.meta.url);
  const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', schema.pathname.replace(/^\/([A-Za-z]:)/, '$1')], {
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`prisma migrate deploy failed:\n${result.stdout}\n${result.stderr}`);
}
