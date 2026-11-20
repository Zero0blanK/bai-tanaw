import type { RemediationResult } from '@tanaw/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AiBadOutputError, AiNotConfiguredError } from '../ai/errors.js';
import type { AskJson, AskJsonOptions } from '../ai/provider.js';
import { prisma } from '../config/prisma.js';
import { hasTestDb, resetDb } from '../test/helpers.js';
import { processJob } from './processJob.js';

/** A stand-in for askJson that returns a fixed reply and records what it was sent. */
function fakeAsk(reply: unknown | Error) {
  const calls: Array<AskJsonOptions<unknown>> = [];
  const fn = (async (options: AskJsonOptions<unknown>) => {
    calls.push(options);
    if (reply instanceof Error) throw reply;
    return { result: reply, provider: 'openai', model: 'gpt-test', inputHash: 'h'.repeat(64), tokensIn: 100, tokensOut: 20 };
  }) as unknown as AskJson;
  return { fn, calls };
}

describe.skipIf(!hasTestDb)('AI jobs', () => {
  beforeEach(() => resetDb());
  afterAll(() => prisma.$disconnect());

  async function seed() {
    const user = await prisma.user.create({ data: { email: `ai${Date.now()}@tanaw.test`, name: 'A', role: 'ASSESSOR', password_hash: 'x' } });
    const target = await prisma.assessmentTarget.create({ data: { name: 'Bayaw', base_url: 'https://bayawjobs.riomar.dev' } });
    const scan = await prisma.scan.create({ data: { target_id: target.id, tool: 'HTTP_CHECK', source: 'WORKER', status: 'DONE' } });
    await prisma.scanResult.createMany({
      data: [
        { scan_id: scan.id, type: 'HEADER', data: { check: 'response', url: 'https://bayawjobs.riomar.dev', status: 200, location: null } },
        { scan_id: scan.id, type: 'HEADER', data: { check: 'security_header', url: 'https://bayawjobs.riomar.dev', header: 'strict-transport-security', present: false, value: null } },
      ],
    });
    return { user, target, scan };
  }

  const interpretReply = {
    findings: [
      {
        title: 'Missing HSTS header',
        category: 'SECURITY_CONFIG',
        affected_asset: 'https://bayawjobs.riomar.dev',
        explanation: 'r2 shows Strict-Transport-Security is not set.',
        evidence_refs: ['r2', 'R2', 'r99'],
        suggested_severity: 'LOW',
        owasp_top10: 'A05:2021 Security Misconfiguration',
        wstg_id: 'WSTG-CONF-07',
      },
    ],
  };

  it('INTERPRET creates PENDING AI findings, links only real evidence refs, and records the analysis', async () => {
    const { user, scan } = await seed();
    const job = await prisma.job.create({ data: { type: 'INTERPRET', ref_id: scan.id, created_by: user.id } });
    const ask = fakeAsk(interpretReply);

    expect(await processJob(job.id, { attempt: 1, maxAttempts: 2, askJson: ask.fn })).toEqual({ status: 'COMPLETED' });

    // The prompt numbered the results and wrapped nothing itself (provider does the wrapping).
    expect(ask.calls[0]?.untrusted).toMatch(/r1 HEADER .*\nr2 HEADER .*strict-transport-security/);

    const findings = await prisma.finding.findMany({ include: { evidence: true } });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ status: 'PENDING', source: 'AI', ai_severity: 'LOW', final_severity: null, wstg_id: 'WSTG-CONF-07', scan_id: scan.id });
    expect(findings[0]?.evidence).toHaveLength(1); // r2 (deduplicated), r99 ignored
    expect(findings[0]?.evidence[0]?.content).toContain('strict-transport-security');

    const analysis = await prisma.aiAnalysis.findFirstOrThrow();
    expect(analysis).toMatchObject({ task: 'INTERPRET', scan_id: scan.id, provider: 'openai', model: 'gpt-test', created_by: user.id, tokens_in: 100 });
    const done = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(done.status).toBe('COMPLETED');
    expect(done.result).toMatchObject({ analysis_id: analysis.id, findings_created: 1, ignored_refs: ['r99'] });
  });

  it('INTERPRET tells the AI what is already recorded and drops findings it repeats anyway', async () => {
    const { user, scan, target } = await seed();
    await prisma.finding.create({
      data: { target_id: target.id, title: 'Missing HSTS header', category: 'SECURITY_CONFIG', description: 'x', affected_asset: 'https://bayawjobs.riomar.dev', source: 'TOOL', fingerprint: 'header:strict-transport-security:https://bayawjobs.riomar.dev' },
    });
    const job = await prisma.job.create({ data: { type: 'INTERPRET', ref_id: scan.id, created_by: user.id } });
    const ask = fakeAsk(interpretReply);
    await processJob(job.id, { attempt: 1, maxAttempts: 2, askJson: ask.fn });

    expect(ask.calls[0]?.context).toContain('- Missing HSTS header (https://bayawjobs.riomar.dev)');
    expect(await prisma.finding.count({ where: { source: 'AI' } })).toBe(0);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).result).toMatchObject({ findings_created: 0, skipped_duplicates: 1 });
  });

  it('INTERPRET with an empty reply creates no findings but still records the analysis', async () => {
    const { user, scan } = await seed();
    const job = await prisma.job.create({ data: { type: 'INTERPRET', ref_id: scan.id, created_by: user.id } });
    await processJob(job.id, { attempt: 1, maxAttempts: 2, askJson: fakeAsk({ findings: [] }).fn });
    expect(await prisma.finding.count()).toBe(0);
    expect(await prisma.aiAnalysis.count()).toBe(1);
  });

  it('a bad AI reply stores nothing and is retried once, then fails', async () => {
    const { user, scan } = await seed();
    const job = await prisma.job.create({ data: { type: 'INTERPRET', ref_id: scan.id, created_by: user.id } });
    const bad = fakeAsk(new AiBadOutputError());

    await expect(processJob(job.id, { attempt: 1, maxAttempts: 2, askJson: bad.fn })).rejects.toBeInstanceOf(AiBadOutputError);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('WAITING');

    expect(await processJob(job.id, { attempt: 2, maxAttempts: 2, askJson: bad.fn })).toEqual({ status: 'FAILED' });
    expect(await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: 'FAILED', attempts: 2 });
    expect(await prisma.finding.count()).toBe(0);
    expect(await prisma.aiAnalysis.count()).toBe(0);
  });

  it('a missing API key fails at once without retrying', async () => {
    const { user, scan } = await seed();
    const job = await prisma.job.create({ data: { type: 'INTERPRET', ref_id: scan.id, created_by: user.id } });
    expect(await processJob(job.id, { attempt: 1, maxAttempts: 2, askJson: fakeAsk(new AiNotConfiguredError()).fn })).toEqual({ status: 'FAILED' });
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).failed_reason).toMatch(/not configured/);
  });

  it('REMEDIATE stores a draft only and never touches the finding', async () => {
    const { user, target, scan } = await seed();
    const finding = await prisma.finding.create({
      data: { target_id: target.id, scan_id: scan.id, title: 'Missing HSTS', category: 'SECURITY_CONFIG', description: 'No HSTS on the frontend.', affected_asset: target.base_url, source: 'AI' },
    });
    const job = await prisma.job.create({ data: { type: 'REMEDIATE', ref_id: finding.id, created_by: user.id } });
    const draft: RemediationResult = {
      summary: 'Send HSTS from the Express app via Helmet.',
      steps: ['Enable helmet.hsts with maxAge 31536000', 'Redeploy and verify with curl -I'],
      code_example: 'app.use(helmet.hsts({ maxAge: 31536000 }))',
      references: ['OWASP ASVS 4.0.3 V14.4.5'],
      confidence: 'HIGH',
    };
    const ask = fakeAsk(draft);
    await processJob(job.id, { attempt: 1, maxAttempts: 2, askJson: ask.fn });

    expect(ask.calls[0]?.context).toContain('Bayaw Jobs');
    expect(ask.calls[0]?.untrusted).toContain('Finding: Missing HSTS');
    const analysis = await prisma.aiAnalysis.findFirstOrThrow({ where: { task: 'REMEDIATE' } });
    expect(analysis).toMatchObject({ finding_id: finding.id, output: draft });
    const after = await prisma.finding.findUniqueOrThrow({ where: { id: finding.id } });
    expect(after.remediation).toBeNull();
    expect(after.status).toBe('PENDING');
  });
});
