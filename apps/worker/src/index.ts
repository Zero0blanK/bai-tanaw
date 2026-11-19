// Worker entry point: consumes the assessment queue. Each job carries only { jobId };
// the job row in Postgres holds the type, the scan/finding it works on, and its status.

import { ASSESSMENT_QUEUE, type QueueJobData } from '@tanaw/shared';
import { Worker } from 'bullmq';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './config/prisma.js';
import { createRedisConnection } from './config/redis.js';
import { processJob } from './jobs/processJob.js';

const connection = createRedisConnection();

const worker = new Worker<QueueJobData>(
  ASSESSMENT_QUEUE,
  async (job) => {
    logger.info('Job received', { name: job.name, job_id: job.data.jobId, attempt: job.attemptsMade + 1 });
    return processJob(job.data.jobId, { attempt: job.attemptsMade + 1, maxAttempts: job.opts.attempts ?? 1 });
  },
  { connection, concurrency: env.WORKER_CONCURRENCY },
);

worker.on('ready', () => {
  logger.info('Worker ready', { queue: ASSESSMENT_QUEUE, concurrency: env.WORKER_CONCURRENCY });
  if (env.ALLOWED_HOSTS.length === 0) {
    logger.warn('ASSESSMENT_ALLOWED_HOSTS is empty: every tool run will be blocked');
  }
});
worker.on('failed', (job, err) => {
  logger.error('Job failed', { bull_job_id: job?.id, error: err.message });
});
// Redis reconnects forever; log each distinct error once instead of on every retry.
let lastError = '';
worker.on('error', (err) => {
  const code = 'code' in err && typeof err.code === 'string' ? err.code : undefined;
  const message = err.message || code || err.name;
  if (message === lastError) return;
  lastError = message;
  logger.error('Worker error (is Redis running at REDIS_URL?)', { error: message });
});
worker.on('ready', () => {
  lastError = '';
});

async function shutdown(signal: string): Promise<void> {
  logger.info('Shutting down', { signal });
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
