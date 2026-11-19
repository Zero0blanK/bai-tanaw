import type { EvidenceType, FindingCategory, FindingSource, FindingStatus, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../config/prisma.js';

const userSelect = { select: { id: true, name: true, email: true } } as const;

export interface FindingFilters {
  target_id?: string | undefined;
  status?: FindingStatus | undefined;
  category?: FindingCategory | undefined;
  source?: FindingSource | undefined;
  page: number;
  limit: number;
}

export const findingRepository = {
  async list(filters: FindingFilters) {
    const where: Prisma.FindingWhereInput = {
      ...(filters.target_id ? { target_id: filters.target_id } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.source ? { source: filters.source } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.finding.findMany({
        where,
        orderBy: [{ created_at: 'desc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          target: { select: { id: true, name: true } },
          _count: { select: { evidence: true } },
        },
      }),
      prisma.finding.count({ where }),
    ]);
    return { items, total };
  },

  create(data: Prisma.FindingUncheckedCreateInput) {
    return prisma.finding.create({ data });
  },

  findById(id: string) {
    return prisma.finding.findUnique({ where: { id } });
  },

  findDetail(id: string) {
    return prisma.finding.findUnique({
      where: { id },
      include: {
        target: { select: { id: true, name: true, base_url: true } },
        scan: { select: { id: true, tool: true, source: true, status: true, params: true, created_at: true } },
        evidence: {
          orderBy: { created_at: 'asc' },
          include: { creator: userSelect, scan_result: { select: { id: true, type: true, data: true } } },
        },
        verification_logs: { orderBy: { created_at: 'asc' }, include: { assessor: userSelect } },
      },
    });
  },

  update(id: string, data: Prisma.FindingUpdateInput, tx: Tx = prisma) {
    return tx.finding.update({ where: { id }, data });
  },

  addVerificationLog(
    data: { finding_id: string; assessor_id: string | null; old_status: FindingStatus; new_status: FindingStatus; notes: string },
    tx: Tx = prisma,
  ) {
    return tx.verificationLog.create({ data });
  },

  countEvidence(finding_id: string) {
    return prisma.evidence.count({ where: { finding_id } });
  },

  findAnalysis(id: string) {
    return prisma.aiAnalysis.findUnique({ where: { id } });
  },

  findScanResult(id: string) {
    return prisma.scanResult.findUnique({ where: { id }, include: { scan: { select: { target_id: true } } } });
  },

  createEvidence(data: {
    id?: string;
    finding_id: string;
    type: EvidenceType;
    content?: string | null;
    file_path?: string | null;
    scan_result_id?: string | null;
    created_by?: string | null;
  }) {
    return prisma.evidence.create({ data });
  },

  findEvidence(id: string) {
    return prisma.evidence.findUnique({ where: { id }, include: { finding: { select: { target_id: true } } } });
  },

  // ─── Insights ──────────────────────────────────────────────────────────────

  async groupCounts(target_id?: string) {
    const where: Prisma.FindingWhereInput = target_id ? { target_id } : {};
    const scanWhere: Prisma.ScanWhereInput = target_id ? { target_id } : {};
    const [byStatus, byCategory, bySource, confirmedBySeverity, pendingByAiSeverity, scansByStatus, scansByTool] = await prisma.$transaction([
      prisma.finding.groupBy({ by: ['status'], where, _count: { _all: true }, orderBy: { status: 'asc' } }),
      prisma.finding.groupBy({ by: ['category'], where, _count: { _all: true }, orderBy: { category: 'asc' } }),
      prisma.finding.groupBy({ by: ['source'], where, _count: { _all: true }, orderBy: { source: 'asc' } }),
      prisma.finding.groupBy({
        by: ['final_severity'],
        where: { ...where, status: 'CONFIRMED' },
        _count: { _all: true },
        orderBy: { final_severity: 'asc' },
      }),
      prisma.finding.groupBy({
        by: ['ai_severity'],
        where: { ...where, status: 'PENDING' },
        _count: { _all: true },
        orderBy: { ai_severity: 'asc' },
      }),
      prisma.scan.groupBy({ by: ['status'], where: scanWhere, _count: { _all: true }, orderBy: { status: 'asc' } }),
      prisma.scan.groupBy({ by: ['tool'], where: scanWhere, _count: { _all: true }, orderBy: { tool: 'asc' } }),
    ]);
    return { byStatus, byCategory, bySource, confirmedBySeverity, pendingByAiSeverity, scansByStatus, scansByTool };
  },

  /** Report: confirmed and fixed findings only (AGENT.md §2.5), most severe first. */
  findForReport(target_id: string) {
    return prisma.finding.findMany({
      where: { target_id, status: { in: ['CONFIRMED', 'FIXED'] } },
      orderBy: [{ cvss_score: 'desc' }, { created_at: 'asc' }],
      include: {
        evidence: { orderBy: { created_at: 'asc' }, include: { scan_result: { select: { type: true, data: true } } } },
        verification_logs: { orderBy: { created_at: 'asc' }, include: { assessor: userSelect } },
      },
    });
  },
};
