import { AI_SETTINGS_KEY, encryptAiKey } from '@tanaw/shared/node';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { hasTestDb, resetDb } from '../test/helpers.js';
import { queueAutoInterpret } from './autoInterpret.js';

describe.skipIf(!hasTestDb)('queueAutoInterpret', () => {
  beforeEach(() => resetDb());
  afterAll(() => prisma.$disconnect());

  async function seed(withKey = true) {
    const user = await prisma.user.create({ data: { email: `auto${Date.now()}@tanaw.test`, name: 'A', role: 'ASSESSOR', password_hash: 'x' } });
    const target = await prisma.assessmentTarget.create({ data: { name: 'T', base_url: 'https://bayawjobs.riomar.dev' } });
    const scan = await prisma.scan.create({ data: { target_id: target.id, tool: 'HTTP_CHECK', source: 'WORKER', status: 'DONE', started_by: user.id } });
    if (withKey) {
      await prisma.appSetting.create({
        data: { key: AI_SETTINGS_KEY, value: { provider: 'openrouter', model: 'openai/gpt-4.1-mini' }, secret: encryptAiKey('sk-or-v1-test-not-real-00000000', env.SETTINGS_ENCRYPTION_KEY) },
      });
    }
    return { scan: { id: scan.id, tool: 'HTTP_CHECK', target_id: target.id, actor_id: user.id, results: 5 }, user };
  }

  it('queues an INTERPRET job charged to the scan owner and audits it as automatic', async () => {
    const { scan, user } = await seed();
    const sent: string[] = [];
    const out = await queueAutoInterpret(scan, async (type, id) => (sent.push(`${type}:${id}`), id));
    expect(out.queued).toBe(true);
    const job = await prisma.job.findFirstOrThrow({ where: { type: 'INTERPRET' } });
    expect(job).toMatchObject({ ref_id: scan.id, created_by: user.id, bull_job_id: job.id });
    expect(sent).toEqual([`INTERPRET:${job.id}`]);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'ai_requested' } });
    expect(log.metadata).toMatchObject({ auto: true, scan_id: scan.id });
  });

  it('skips DNS, empty scans, missing keys and users over the daily cap', async () => {
    const never = async () => {
      throw new Error('should not enqueue');
    };
    const { scan, user } = await seed();
    expect(await queueAutoInterpret({ ...scan, tool: 'DNS' }, never)).toMatchObject({ queued: false });
    expect(await queueAutoInterpret({ ...scan, results: 0 }, never)).toMatchObject({ queued: false, reason: 'no results to interpret' });

    await prisma.job.createMany({ data: Array.from({ length: env.AI_DAILY_LIMIT }, () => ({ type: 'INTERPRET' as const, ref_id: scan.id, created_by: user.id })) });
    expect(await queueAutoInterpret(scan, never)).toMatchObject({ queued: false, reason: 'daily AI limit reached' });

    await prisma.appSetting.deleteMany();
    expect(await queueAutoInterpret(scan, never)).toMatchObject({ queued: false, reason: expect.stringMatching(/API key/) });
  });
});
