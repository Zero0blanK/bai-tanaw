import type { JobStatus, JobType, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../config/prisma.js';

export const jobRepository = {
  create(
    data: { type: JobType; ref_id: string; created_by?: string | null; payload?: Prisma.InputJsonValue },
    tx: Tx = prisma,
  ) {
    return tx.job.create({ data });
  },

  /** AI interpretations of the given scans, newest first. */
  listInterpretations(scanIds: string[]) {
    if (scanIds.length === 0) return Promise.resolve([]);
    return prisma.job.findMany({ where: { type: 'INTERPRET', ref_id: { in: scanIds } }, orderBy: { created_at: 'desc' } });
  },

  findById(id: string) {
    return prisma.job.findUnique({ where: { id } });
  },

  setBullId(id: string, bull_job_id: string) {
    return prisma.job.update({ where: { id }, data: { bull_job_id } });
  },

  markFailed(id: string, failed_reason: string, status: JobStatus = 'FAILED') {
    return prisma.job.update({ where: { id }, data: { status, failed_reason, finished_at: new Date() } });
  },
};
