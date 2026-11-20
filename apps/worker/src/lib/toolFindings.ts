// Every finished scan becomes PENDING findings (source TOOL) through the fixed rules in @tanaw/shared.
// Runs inside the scan's own transaction, so results and their findings appear together or not at all.

import type { Prisma, PrismaClient } from '@prisma/client';
import { DEDUP_STATUSES, deriveToolFindings, type RuleResult } from '@tanaw/shared';
import { redact } from '@tanaw/shared/node';

export type Tx = Prisma.TransactionClient | PrismaClient;

export interface ToolFindingScan {
  id: string;
  tool: string;
  target_id: string;
  target_base_url: string;
  actor_id: string | null;
}

export interface ToolFindingOutcome {
  created: number;
  duplicates: number;
  finding_ids: string[];
}

export async function createToolFindings(tx: Tx, scan: ToolFindingScan, results: RuleResult[]): Promise<ToolFindingOutcome> {
  const candidates = deriveToolFindings({ tool: scan.tool, targetBaseUrl: scan.target_base_url, results });
  if (candidates.length === 0) return { created: 0, duplicates: 0, finding_ids: [] };

  // A problem already open, confirmed or dismissed for this target isn't raised again. A FIXED one that shows up
  // again is a regression, so it gets a new finding.
  const existing = await tx.finding.findMany({
    where: {
      target_id: scan.target_id,
      fingerprint: { in: candidates.map((c) => c.fingerprint) },
      status: { in: [...DEDUP_STATUSES] },
    },
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
        status: 'PENDING', // tools never set anything else
        ai_severity: c.severity, // the suggested severity; the assessor sets final_severity
        owasp_top10: c.owasp_top10,
        wstg_id: c.wstg_id,
        fingerprint: c.fingerprint,
        suggested_cvss_vector: c.cvss_vector,
        suggested_cvss_score: c.cvss_score,
        suggested_remediation: c.remediation,
        cve_ids: c.cve_ids,
      },
    });
    ids.push(finding.id);
    const evidence = c.result_ids.flatMap((id) => {
      const result = byId.get(id);
      return result
        ? [
            {
              finding_id: finding.id,
              type: 'TOOL_OUTPUT' as const,
              scan_result_id: id,
              content: redact(JSON.stringify(result.data)).slice(0, 4000),
              created_by: scan.actor_id,
            },
          ]
        : [];
    });
    if (evidence.length > 0) await tx.evidence.createMany({ data: evidence });
  }
  return { created: ids.length, duplicates: candidates.length - ids.length, finding_ids: ids };
}
