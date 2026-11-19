import type { JobType } from '@tanaw/shared';
import { logger } from '../config/logger.js';
import { jobRepository } from '../repositories/job.repository.js';
import { enqueue } from '../queues/assessment.queue.js';
import { NotFoundError, ServiceUnavailableError } from '../utils/errors.js';

export const jobService = {
  /**
   * Hands an already-created job row to BullMQ. If Redis is unreachable the job is marked FAILED
   * and the caller gets a 503 instead of a job that would never run.
   */
  async dispatch(job: { id: string; type: JobType }, onFailure?: (reason: string) => Promise<unknown>) {
    try {
      const bullId = await enqueue(job.type, job.id);
      return await jobRepository.setBullId(job.id, bullId);
    } catch (error) {
      const reason = 'Queue unavailable (is Redis running?)';
      logger.error('Enqueue failed', { job_id: job.id, type: job.type, error });
      await jobRepository.markFailed(job.id, reason);
      await onFailure?.(reason);
      throw new ServiceUnavailableError(reason);
    }
  },

  async get(id: string) {
    const job = await jobRepository.findById(id);
    if (!job) throw new NotFoundError('Job not found');
    return job;
  },
};
