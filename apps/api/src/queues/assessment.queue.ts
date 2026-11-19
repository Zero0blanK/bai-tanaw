// BullMQ producer. The message carries only { jobId }; the `jobs` row holds type, ref_id and status.

import { ASSESSMENT_QUEUE, type JobType, type QueueJobData } from '@tanaw/shared';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

let queue: Queue<QueueJobData> | undefined;

function getQueue(): Queue<QueueJobData> {
  if (!queue) {
    // Fail fast instead of hanging the request when Redis is down.
    const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true });
    queue = new Queue<QueueJobData>(ASSESSMENT_QUEUE, { connection });
  }
  return queue;
}

/** Tool runs are not retried (a second scan is noise on the target); AI calls retry once (Phase 5). */
const ATTEMPTS: Record<JobType, number> = {
  RUN_CHECK: 1,
  RUN_NMAP: 1,
  RUN_ZAP: 1,
  INTERPRET: 2,
  REMEDIATE: 2,
};

/** Adds the job to Redis and returns BullMQ's id (we reuse our own job id). */
export async function enqueue(type: JobType, jobId: string): Promise<string> {
  const job = await getQueue().add(
    type,
    { jobId },
    {
      jobId,
      attempts: ATTEMPTS[type],
      backoff: { type: 'fixed', delay: 5_000 },
      removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
      removeOnFail: { age: 30 * 24 * 3600 },
    },
  );
  return job.id ?? jobId;
}

export async function closeQueue(): Promise<void> {
  await queue?.close();
  queue = undefined;
}
