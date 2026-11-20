// The worker also produces jobs (automatic AI interpretation after a scan). Same message shape and retry rules as
// the API's producer: only { jobId }, attempts from JOB_ATTEMPTS.

import { ASSESSMENT_QUEUE, JOB_ATTEMPTS, type JobType, type QueueJobData } from '@tanaw/shared';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

let queue: Queue<QueueJobData> | undefined;

function getQueue(): Queue<QueueJobData> {
  if (!queue) {
    const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true });
    queue = new Queue<QueueJobData>(ASSESSMENT_QUEUE, { connection });
  }
  return queue;
}

export async function enqueueJob(type: JobType, jobId: string): Promise<string> {
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
