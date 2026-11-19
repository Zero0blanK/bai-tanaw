// Dashboard numbers and report data (feature 06).

import { cvssSeverity } from '@tanaw/shared';
import { findingRepository } from '../repositories/finding.repository.js';
import { scanRepository } from '../repositories/scan.repository.js';
import { targetRepository } from '../repositories/target.repository.js';
import { NotFoundError } from '../utils/errors.js';
import { auditService, type Actor } from './audit.service.js';

type Grouped = Array<{ _count: { _all: number } | true | undefined } & Record<string, unknown>>;

function toCounts(rows: Grouped, key: string): Record<string, number> {
  return Object.fromEntries(
    rows.map((row) => [String(row[key] ?? 'UNSET'), typeof row._count === 'object' && row._count ? row._count._all : 0]),
  );
}

export const METHODOLOGY = {
  phases: ['Define scope', 'Reconnaissance', 'Scanning', 'Security assessment', 'AI analysis', 'Findings verification', 'Risk assessment', 'Report'],
  frameworks: ['NIST SP 800-115', 'OWASP WSTG v4.2', 'OWASP Top 10:2021', 'CVSS v3.1', 'OWASP ASVS 4.0.3', 'OWASP Top 10 for LLM Applications 2025'],
  categories: ['AUTHENTICATION', 'ACCESS_CONTROL', 'SECURITY_CONFIG'],
};

export const insightsService = {
  async dashboard(targetId?: string) {
    if (targetId && !(await targetRepository.findById(targetId))) throw new NotFoundError('Target not found');
    const g = await findingRepository.groupCounts(targetId);
    const byStatus = toCounts(g.byStatus as Grouped, 'status');
    return {
      target_id: targetId ?? null,
      totals: {
        findings: Object.values(byStatus).reduce((a, b) => a + b, 0),
        open_confirmed: byStatus.CONFIRMED ?? 0,
        pending_review: byStatus.PENDING ?? 0,
        fixed: byStatus.FIXED ?? 0,
      },
      findings: {
        by_status: byStatus,
        by_category: toCounts(g.byCategory as Grouped, 'category'),
        by_source: toCounts(g.bySource as Grouped, 'source'),
        // Only verified findings count toward real severity.
        confirmed_by_severity: toCounts(g.confirmedBySeverity as Grouped, 'final_severity'),
        pending_by_ai_severity: toCounts(g.pendingByAiSeverity as Grouped, 'ai_severity'),
      },
      scans: {
        by_status: toCounts(g.scansByStatus as Grouped, 'status'),
        by_tool: toCounts(g.scansByTool as Grouped, 'tool'),
      },
    };
  },

  /** Report data: CONFIRMED and FIXED findings only, with evidence, verification history and remediation. */
  async report(targetId: string, actor: Actor) {
    const target = await targetRepository.findById(targetId);
    if (!target) throw new NotFoundError('Target not found');

    const [findings, scans, dashboard] = await Promise.all([
      findingRepository.findForReport(targetId),
      scanRepository.listForTarget(targetId),
      this.dashboard(targetId),
    ]);

    await auditService.log('report_exported', actor, { target_id: targetId, metadata: { findings: findings.length } });

    return {
      generated_at: new Date().toISOString(),
      target: {
        id: target.id,
        name: target.name,
        base_url: target.base_url,
        description: target.description,
        authorization_note: target.authorization_note,
        test_window_start: target.test_window_start,
        test_window_end: target.test_window_end,
      },
      scope: target.scope_rules.map((r) => ({ asset_type: r.asset_type, value: r.value, in_scope: r.in_scope, notes: r.notes })),
      methodology: { ...METHODOLOGY, tools: [...new Set(scans.map((s) => s.tool))] },
      scans: scans.map((s) => ({
        id: s.id,
        tool: s.tool,
        source: s.source,
        status: s.status,
        started_at: s.started_at,
        finished_at: s.finished_at,
        results: s._count.results,
      })),
      summary: { ...dashboard.totals, ...dashboard.findings },
      findings: findings.map((f) => {
        const lastDecision = f.verification_logs.at(-1);
        return {
          id: f.id,
          title: f.title,
          category: f.category,
          status: f.status,
          severity: f.final_severity,
          cvss_score: f.cvss_score,
          cvss_vector: f.cvss_vector,
          cvss_rating: f.cvss_score !== null ? cvssSeverity(f.cvss_score) : null,
          owasp_top10: f.owasp_top10,
          wstg_id: f.wstg_id,
          source: f.source,
          ai_suggested_severity: f.ai_severity,
          affected_asset: f.affected_asset,
          description: f.description,
          remediation: f.remediation,
          verified: lastDecision
            ? { by: lastDecision.assessor?.name ?? 'deleted user', at: lastDecision.created_at, status: lastDecision.new_status, notes: lastDecision.notes }
            : null,
          history: f.verification_logs.map((l) => ({
            from: l.old_status,
            to: l.new_status,
            by: l.assessor?.name ?? 'deleted user',
            at: l.created_at,
            notes: l.notes,
          })),
          evidence: f.evidence.map((e) => ({
            id: e.id,
            type: e.type,
            has_file: Boolean(e.file_path),
            file_url: e.file_path ? `/api/evidence/${e.id}/file` : null,
            content: e.content ?? (e.scan_result ? JSON.stringify(e.scan_result.data) : null),
            created_at: e.created_at,
          })),
        };
      }),
    };
  },
};
