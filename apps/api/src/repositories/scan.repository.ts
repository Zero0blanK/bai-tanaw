import type { Prisma, ScanResultType, ScanSource, ScanStatus, ScanTool } from '@prisma/client';
import type { ScanResultInput } from '@tanaw/shared';
import { prisma, type Tx } from '../config/prisma.js';

const starterSelect = { select: { id: true, name: true, email: true } } as const;

export const scanRepository = {
  create(
    data: {
      target_id: string;
      tool: ScanTool;
      source: ScanSource;
      status?: ScanStatus;
      params?: Prisma.InputJsonValue;
      started_by?: string | null;
      started_at?: Date | null;
      finished_at?: Date | null;
    },
    tx: Tx = prisma,
  ) {
    return tx.scan.create({ data });
  },

  addResults(scan_id: string, results: ScanResultInput[], tx: Tx = prisma) {
    if (results.length === 0) return Promise.resolve({ count: 0 });
    return tx.scanResult.createMany({
      data: results.map((r) => ({ scan_id, type: r.type, data: r.data as Prisma.InputJsonValue })),
    });
  },

  update(id: string, data: Prisma.ScanUpdateInput, tx: Tx = prisma) {
    return tx.scan.update({ where: { id }, data });
  },

  findById(id: string) {
    return prisma.scan.findUnique({ where: { id } });
  },

  findDetail(id: string) {
    return prisma.scan.findUnique({
      where: { id },
      include: {
        starter: starterSelect,
        target: { select: { id: true, name: true, base_url: true } },
        _count: { select: { results: true, findings: true } },
      },
    });
  },

  async listResults(scan_id: string, filters: { type?: ScanResultType | undefined; page: number; limit: number }) {
    const where: Prisma.ScanResultWhereInput = { scan_id, ...(filters.type ? { type: filters.type } : {}) };
    const [items, total, byType] = await prisma.$transaction([
      prisma.scanResult.findMany({
        where,
        orderBy: { created_at: 'asc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.scanResult.count({ where }),
      prisma.scanResult.groupBy({ by: ['type'], where: { scan_id }, _count: { _all: true }, orderBy: { type: 'asc' } }),
    ]);
    const counts = Object.fromEntries(byType.map((g) => [g.type, (g._count as { _all: number })._all]));
    return { items, total, counts };
  },

  listForTarget(target_id: string) {
    return prisma.scan.findMany({
      where: { target_id },
      orderBy: { created_at: 'desc' },
      include: { starter: starterSelect, _count: { select: { results: true, findings: true } } },
    });
  },
};
