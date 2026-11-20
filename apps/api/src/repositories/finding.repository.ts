import type { EvidenceType, FindingCategory, FindingSource, FindingStatus, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../config/prisma.js';
import { DEDUP_STATUSES, deriveToolFindings, type RuleResult } from '@tanaw/shared';
import { redact } from '@tanaw/shared/node';

const userSelect = { select: { id: true, name: true, email: true } } as const;

export interface FindingFilters {
  target_id?: string | undefined;
  status?: FindingStatus | undefined;
  category?: FindingCategory | undefined;
  source?: FindingSource | undefined;
  q?: string | undefined;
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
      ...(filters.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: 'insensitive' as const } },
              { affected_asset: { contains: filters.q, mode: 'insensitive' as const } },
              { description: { contains: filters.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
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

  async countByStatusForTarget(target_id: string): Promise<Record<string, number>> {
    const rows = await prisma.finding.groupBy({ by: ['status'], where: { target_id }, _count: { _all: true }, orderBy: { status: 'asc' } });
    return Object.fromEntries(rows.map((r) => [r.status, (r._count as { _all: number })._all]));
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

/**
 * Creates PENDING tool findings for an imported report (the worker does the same for tool runs, see
 * apps/worker/src/lib/toolFindings.ts). Skips problems already recorded for the target (same fingerprint).
 */
export async function createToolFindings(
  tx: Tx,
  scan: { id: string; tool: string; target_id: string; target_base_url: string; actor_id: string | null },
  results: RuleResult[],
): Promise<{ created: number; duplicates: number; finding_ids: string[] }> {
  const candidates = deriveToolFindings({ tool: scan.tool, targetBaseUrl: scan.target_base_url, results });
  if (candidates.length === 0) return { created: 0, duplicates: 0, finding_ids: [] };
  const existing = await tx.finding.findMany({
    where: { target_id: scan.target_id, fingerprint: { in: candidates.map((c) => c.fingerprint) }, status: { in: [...DEDUP_STATUSES] } },
    select: { fingerprint: true },
  });
  const known = new Set(existing.map((f) => f.fingerprint));
  const byId = new Map(results.map((r) => [r.id, r]));
  const ids: string[] = [];
  for (const c of candidates) {
    if (known.has(c.fingerprint)) continue;
    const finding = await tx.finding.create({
      data: {
        target_id: scan.target_id,
        scan_id: scan.id,
        title: c.title.slice(0, 300),
        category: c.category,
        description: c.description,
        affected_asset: c.affected_asset.slice(0, 500),
        source: 'TOOL',
        status: 'PENDING',
        ai_severity: c.severity,
        owasp_top10: c.owasp_top10,
        wstg_id: c.wstg_id,
        fingerprint: c.fingerprint,
      },
    });
    ids.push(finding.id);
    const evidence = c.result_ids.flatMap((id) => {
      const result = byId.get(id);
      return result
        ? [{ finding_id: finding.id, type: 'TOOL_OUTPUT' as const, scan_result_id: id, content: redact(JSON.stringify(result.data)).slice(0, 4000), created_by: scan.actor_id }]
        : [];
    });
    if (evidence.length > 0) await tx.evidence.createMany({ data: evidence });
  }
  return { created: ids.length, duplicates: candidates.length - ids.length, finding_ids: ids };
}
