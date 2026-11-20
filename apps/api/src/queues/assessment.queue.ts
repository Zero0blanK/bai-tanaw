// BullMQ producer. The message carries only { jobId }; the `jobs` row holds type, ref_id and status.

import { ASSESSMENT_QUEUE, JOB_ATTEMPTS, type JobType, type QueueJobData } from '@tanaw/shared';
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

/** Adds the job to Redis and returns BullMQ's id (we reuse our own job id). */
export async function enqueue(type: JobType, jobId: string): Promise<string> {
  const job = await getQueue().add(
    type,
    { jobId },
    {
      jobId,
      attempts: JOB_ATTEMPTS[type],
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
