// Entry point for every queued job: mirrors status into the `jobs` table and dispatches by type.

import type { Prisma } from '@prisma/client';
import { AiBadOutputError, AiProviderError } from '../ai/errors.js';
import type { AskJson } from '../ai/provider.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';
import { runInterpret } from './interpret.js';
import { runRemediate } from './remediate.js';
import { runScan, type ToolDeps } from './runScan.js';

export interface ProcessContext {
  /** 1-based attempt number from BullMQ. */
  attempt: number;
  maxAttempts: number;
  tools?: ToolDeps;
  askJson?: AskJson;
}

/** Only provider hiccups and malformed replies are worth a retry; everything else fails at once. */
function isRetryable(error: unknown): boolean {
  if (error instanceof AiProviderError || error instanceof AiBadOutputError) return true;
  const name = (error as Error)?.name;
  return name === 'TimeoutError' || name === 'AbortError' || (error as Error)?.message === 'fetch failed';
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
      case 'REMEDIATE': {
        const result =
          job.type === 'INTERPRET'
            ? await runInterpret(job.ref_id, job.created_by, ctx.askJson)
            : await runRemediate(job.ref_id, job.created_by, ctx.askJson);
        await prisma.job.update({
          where: { id: job.id },
          data: { status: 'COMPLETED', failed_reason: null, result: result as unknown as Prisma.InputJsonValue, finished_at: new Date() },
        });
        return { status: 'COMPLETED' };
      }
    }
  } catch (error) {
    const message = ((error as Error).message ?? String(error)).slice(0, 1000);
    const retryable = isRetryable(error);
    const final = !retryable || ctx.attempt >= ctx.maxAttempts;
    await prisma.job.update({
      where: { id: job.id },
      data: { status: final ? 'FAILED' : 'WAITING', failed_reason: message, ...(final ? { finished_at: new Date() } : {}) },
    });
    logger.error('Job errored', { job_id: job.id, type: job.type, attempt: ctx.attempt, final, error: message });
    // Throwing makes BullMQ retry; a non-retryable error is recorded and the job ends here.
    if (retryable && !final) throw error;
    return { status: 'FAILED' };
  }
}
