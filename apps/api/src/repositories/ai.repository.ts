import { prisma } from '../config/prisma.js';

const creatorSelect = { select: { id: true, name: true, email: true } } as const;

export const aiRepository = {
  listForScan(scan_id: string) {
    return prisma.aiAnalysis.findMany({
      where: { scan_id, task: 'INTERPRET' },
      orderBy: { created_at: 'desc' },
      include: { creator: creatorSelect },
    });
  },

  listForFinding(finding_id: string) {
    return prisma.aiAnalysis.findMany({
      where: { finding_id, task: 'REMEDIATE' },
      orderBy: { created_at: 'desc' },
      include: { creator: creatorSelect },
    });
  },

  /** AI jobs a user started since `since` (queued, running, finished or failed all count). */
  countJobsSince(created_by: string, since: Date) {
    return prisma.job.count({
      where: { created_by, type: { in: ['INTERPRET', 'REMEDIATE'] }, created_at: { gte: since } },
    });
  },
};

export const findingLookup = {
  findById(id: string) {
    return prisma.finding.findUnique({ where: { id }, select: { id: true, target_id: true, title: true } });
  },
};
