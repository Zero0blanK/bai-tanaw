import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface AuditLogFilters {
  action?: string | undefined;
  actor_id?: string | undefined;
  target_id?: string | undefined;
  page: number;
  limit: number;
}

export const auditLogRepository = {
  create(data: Prisma.AuditLogUncheckedCreateInput) {
    return prisma.auditLog.create({ data });
  },

  async list(filters: AuditLogFilters) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.actor_id ? { actor_id: filters.actor_id } : {}),
      ...(filters.target_id ? { target_id: filters.target_id } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, email: true, name: true } } },
        orderBy: { created_at: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  },
};
