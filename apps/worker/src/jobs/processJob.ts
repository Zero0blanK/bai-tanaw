// Entry point for every queued job: mirrors status into the `jobs` table and dispatches by type.

import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';
import { runScan, type ToolDeps } from './runScan.js';

export interface ProcessContext {
  /** 1-based attempt number from BullMQ. */
  attempt: number;
  maxAttempts: number;
  tools?: ToolDeps;
}

export async function processJob(jobId: string, ctx: ProcessContext): Promise<{ status: string }> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.status === 'COMPLETED') return { status: 'COMPLETED' };

  await prisma.job.update({
    where: { id: job.id },
    data: { status: 'ACTIVE', attempts: ctx.attempt, started_at: job.started_at ?? new Date() },
  });

  try {
    switch (job.type) {
      case 'RUN_CHECK':
      case 'RUN_NMAP':
      case 'RUN_ZAP': {
        // Tool failures are recorded on the scan; the job itself completed its work either way.
        const outcome = await runScan(job.ref_id, ctx.tools);
        const failed = outcome.status === 'FAILED';
        await prisma.job.update({
          where: { id: job.id },
          data: { status: failed ? 'FAILED' : 'COMPLETED', failed_reason: outcome.error ?? null, finished_at: new Date() },
        });
        return { status: failed ? 'FAILED' : 'COMPLETED' };
      }
      case 'INTERPRET':
      case 'REMEDIATE':
        throw new Error(`${job.type} jobs arrive in Phase 5`);
    }
  } catch (error) {
    const message = ((error as Error).message ?? String(error)).slice(0, 1000);
    const final = ctx.attempt >= ctx.maxAttempts;
    await prisma.job.update({
      where: { id: job.id },
      data: { status: final ? 'FAILED' : 'WAITING', failed_reason: message, ...(final ? { finished_at: new Date() } : {}) },
    });
    logger.error('Job errored', { job_id: job.id, type: job.type, attempt: ctx.attempt, final, error: message });
    throw error;
  }
}
