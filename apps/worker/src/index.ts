// Worker entry point: consumes the assessment queue. Each job carries only { jobId };
// the job row in Postgres holds the type and payload (Phase 4 wires the processors).

import { ASSESSMENT_QUEUE, type QueueJobData } from '@tanaw/shared';
import { Worker } from 'bullmq';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { createRedisConnection } from './config/redis.js';

const connection = createRedisConnection();

const worker = new Worker<QueueJobData>(
  ASSESSMENT_QUEUE,
  async (job) => {
    logger.info('Job received', { name: job.name, bull_job_id: job.id, job_id: job.data.jobId });
    // Processors per job type (RUN_CHECK, RUN_NMAP, RUN_ZAP, INTERPRET, REMEDIATE) land in Phase 4/5.
    return { handled: false };
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
worker.on('error', (err) => logger.error('Worker error', { error: err.message }));

async function shutdown(signal: string): Promise<void> {
  logger.info('Shutting down', { signal });
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
