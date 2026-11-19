import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../config/prisma.js';
import { storage } from '../config/storage.js';
import { hasTestDb, resetDb, startServer } from '../test/helpers.js';
import { processJob } from './processJob.js';

describe.skipIf(!hasTestDb)('processJob (tool scans)', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;

  beforeAll(async () => {
    srv = await startServer((_req, res) => {
      res.setHeader('x-frame-options', 'DENY');
      res.end('ok');
    });
  });
  beforeEach(() => resetDb());
  afterAll(async () => {
    await srv.close();
    await prisma.$disconnect();
  });

  async function queueScan(params: Record<string, string>, tool: 'HTTP_CHECK' | 'NMAP' = 'HTTP_CHECK', baseUrl = srv.url) {
    const user = await prisma.user.create({
      data: { email: `a${Date.now()}@tanaw.test`, name: 'Assessor', role: 'ASSESSOR', password_hash: 'x' },
    });
    const target = await prisma.assessmentTarget.create({ data: { name: 'Local', base_url: baseUrl, created_by: user.id } });
    const scan = await prisma.scan.create({ data: { target_id: target.id, tool, source: 'WORKER', params, started_by: user.id } });
    const job = await prisma.job.create({ data: { type: tool === 'NMAP' ? 'RUN_NMAP' : 'RUN_CHECK', ref_id: scan.id, created_by: user.id } });
    return { user, target, scan, job };
  }

  it('runs an HTTP check, stores results and marks scan DONE and job COMPLETED', async () => {
    const { scan, job } = await queueScan({ url: `${srv.url}/` });
    const out = await processJob(job.id, { attempt: 1, maxAttempts: 1 });
    expect(out.status).toBe('COMPLETED');

    const stored = await prisma.scan.findUniqueOrThrow({ where: { id: scan.id }, include: { results: true } });
    expect(stored.status).toBe('DONE');
    expect(stored.finished_at).not.toBeNull();
    expect(stored.results.some((r) => r.type === 'HEADER')).toBe(true);
    expect(stored.results.some((r) => r.type === 'CORS')).toBe(true);
    expect(await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: 'COMPLETED', attempts: 1 });
  });

  it('re-checks scope at run time: a rule added after queueing blocks the scan and is audited', async () => {
    const { target, scan, job, user } = await queueScan({ url: `${srv.url}/` });
    await prisma.scopeRule.create({ data: { target_id: target.id, asset_type: 'HOST', value: 'localhost', in_scope: false } });

    const out = await processJob(job.id, { attempt: 1, maxAttempts: 1 });
    expect(out.status).toBe('FAILED');
    const stored = await prisma.scan.findUniqueOrThrow({ where: { id: scan.id }, include: { results: true } });
    expect(stored.status).toBe('FAILED');
    expect(stored.error).toMatch(/outside the authorized scope/);
    expect(stored.results).toHaveLength(0);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'scope_blocked' } });
    expect(audit).toMatchObject({ actor_id: user.id, target_id: target.id });
    expect(audit.metadata).toMatchObject({ stage: 'worker', scan_id: scan.id });
  });

  it('refuses to run outside the test window', async () => {
    const { target, scan, job } = await queueScan({ url: `${srv.url}/` });
    await prisma.assessmentTarget.update({ where: { id: target.id }, data: { test_window_end: new Date(Date.now() - 60_000) } });
    await processJob(job.id, { attempt: 1, maxAttempts: 1 });
    expect((await prisma.scan.findUniqueOrThrow({ where: { id: scan.id } })).error).toMatch(/test window/);
  });

  it('runs Nmap through the injected runner and stores the raw XML', async () => {
    const { scan, job, target } = await queueScan({ host: 'localhost', ports: '8787' }, 'NMAP', 'http://localhost:8787');
    const xml = '<nmaprun><host><address addr="127.0.0.1"/><hostnames><hostname name="localhost"/></hostnames><ports><port protocol="tcp" portid="8787"><state state="open"/></port></ports></host></nmaprun>';
    const notUsed = () => Promise.reject(new Error('not used'));
    await processJob(job.id, {
      attempt: 1,
      maxAttempts: 1,
      tools: {
        httpCheck: notUsed,
        dns: notUsed,
        openapi: notUsed,
        zap: notUsed,
        nmap: async () => ({
          results: [{ type: 'PORT', data: { host: 'localhost', addresses: ['127.0.0.1'], protocol: 'tcp', port: 8787, state: 'open', reason: null } }],
          hosts: [{ host: 'localhost' }, { host: 'localhost', port: 8787 }],
          raw: { ext: 'xml', content: xml },
        }),
      },
    });
    const stored = await prisma.scan.findUniqueOrThrow({ where: { id: scan.id } });
    expect(stored.status).toBe('DONE');
    expect(stored.raw_output_path).toBe(`targets/${target.id}/scans/${scan.id}.xml`);
    expect((await storage.get(stored.raw_output_path ?? '')).toString()).toBe(xml);
  });

  it('fails the scan when Nmap reports a host outside scope', async () => {
    const { scan, job } = await queueScan({ host: 'localhost', ports: '8787' }, 'NMAP', 'http://localhost:8787');
    const notUsed = () => Promise.reject(new Error('not used'));
    await processJob(job.id, {
      attempt: 1,
      maxAttempts: 1,
      tools: {
        httpCheck: notUsed,
        dns: notUsed,
        openapi: notUsed,
        zap: notUsed,
        nmap: async () => ({ results: [], hosts: [{ host: 'evil.example', port: 8787 }] }),
      },
    });
    expect((await prisma.scan.findUniqueOrThrow({ where: { id: scan.id } })).status).toBe('FAILED');
  });

  it('marks the scan FAILED with the tool error when the target is unreachable', async () => {
    const { scan, job } = await queueScan({ url: 'http://localhost:1/' });
    await processJob(job.id, { attempt: 1, maxAttempts: 1 });
    const stored = await prisma.scan.findUniqueOrThrow({ where: { id: scan.id } });
    expect(stored.status).toBe('FAILED');
    expect(stored.error).toBeTruthy();
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('FAILED');
  });
});
