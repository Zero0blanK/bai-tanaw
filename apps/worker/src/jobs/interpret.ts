// Feature 1: Interpreting scan results. The AI's findings become PENDING findings only (AGENT.md §2.5);
// only an assessor can confirm them. Analysis + findings + evidence are written in one transaction.

import type { Prisma } from '@prisma/client';
import { DEDUP_STATUSES, InterpretJsonSchema, InterpretSchema, normalizeFindingTitle } from '@tanaw/shared';
import { redact } from '@tanaw/shared/node';
import { prisma } from '../config/prisma.js';
import { askJson as defaultAskJson, type AskJson } from '../ai/provider.js';
import { INTERPRET_SYSTEM_PROMPT } from '../ai/prompts/interpret.js';

export const MAX_RESULTS_IN_PROMPT = 150;
export const MAX_LINE_CHARS = 600;
/** Existing findings listed to the AI so it doesn't repeat them. */
export const MAX_KNOWN_FINDINGS = 60;

export interface InterpretOutcome {
  analysis_id: string;
  findings_created: number;
  finding_ids: string[];
  ignored_refs: string[];
  /** AI findings dropped because the same problem is already recorded for the target. */
  skipped_duplicates: number;
}

export async function runInterpret(scanId: string, createdBy: string | null, askJson: AskJson = defaultAskJson): Promise<InterpretOutcome> {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: {
      target: { select: { name: true, base_url: true } },
      results: { orderBy: { created_at: 'asc' }, take: MAX_RESULTS_IN_PROMPT },
      _count: { select: { results: true } },
    },
  });
  if (!scan) throw new Error(`Scan ${scanId} not found`);
  if (scan.status !== 'DONE') throw new Error('Scan is not finished');
  if (scan.results.length === 0) throw new Error('Scan has no results to interpret');

  // Number each result so the AI can cite evidence; keep the map back to row ids.
  const refs = new Map<string, (typeof scan.results)[number]>();
  const lines = scan.results.map((result, index) => {
    const ref = `r${index + 1}`;
    refs.set(ref, result);
    return `${ref} ${result.type} ${JSON.stringify(result.data).slice(0, MAX_LINE_CHARS)}`;
  });
  const shown = scan._count.results > MAX_RESULTS_IN_PROMPT ? ` (first ${MAX_RESULTS_IN_PROMPT} shown)` : '';
  const header = `Tool: ${scan.tool} (source: ${scan.source})\nTarget: ${scan.target.name} ${scan.target.base_url}\nResults: ${scan._count.results}${shown}`;

  // Tool rules (and earlier runs) may already have recorded some problems; tell the AI so it adds what they missed.
  const known = await prisma.finding.findMany({
    where: { target_id: scan.target_id, status: { in: [...DEDUP_STATUSES] } },
    select: { title: true, affected_asset: true, fingerprint: true },
    orderBy: { created_at: 'desc' },
    take: 500,
  });
  const knownTitles = new Set(known.map((f) => normalizeFindingTitle(f.title)));
  const knownFingerprints = new Set(known.map((f) => f.fingerprint).filter(Boolean));
  const context =
    known.length > 0
      ? `Findings already recorded for this target. Do not report them again; report only problems they do not cover:\n${known
          .slice(0, MAX_KNOWN_FINDINGS)
          .map((f) => `- ${f.title} (${f.affected_asset})`)
          .join('\n')}`
      : undefined;

  const ai = await askJson({
    task: 'interpret',
    system: INTERPRET_SYSTEM_PROMPT,
    untrusted: `${header}\n${lines.join('\n')}`,
    context,
    schema: InterpretSchema,
    jsonSchema: InterpretJsonSchema,
  });

  const ignored = new Set<string>();
  return prisma.$transaction(async (tx) => {
    const analysis = await tx.aiAnalysis.create({
      data: {
        scan_id: scan.id,
        task: 'INTERPRET',
        provider: ai.provider,
        model: ai.model,
        input_hash: ai.inputHash,
        output: ai.result as Prisma.InputJsonValue,
        tokens_in: ai.tokensIn,
        tokens_out: ai.tokensOut,
        created_by: createdBy,
      },
    });

    const findingIds: string[] = [];
    let skipped = 0;
    for (const item of ai.result.findings) {
      const normalized = normalizeFindingTitle(item.title);
      const fingerprint = `ai:${normalized}`.slice(0, 300);
      if (knownTitles.has(normalized) || knownFingerprints.has(fingerprint)) {
        skipped += 1;
        continue;
      }
      knownTitles.add(normalized);
      const finding = await tx.finding.create({
        data: {
          target_id: scan.target_id,
          scan_id: scan.id,
          title: item.title,
          category: item.category,
          description: item.explanation,
          affected_asset: item.affected_asset,
          source: 'AI',
          status: 'PENDING', // never anything else from AI (AGENT.md §7.2)
          ai_severity: item.suggested_severity,
          owasp_top10: item.owasp_top10 || null,
          wstg_id: item.wstg_id || null,
          fingerprint,
        },
      });
      findingIds.push(finding.id);

      // Link the cited results as evidence. Refs the AI made up are ignored.
      const cited = new Set(item.evidence_refs.map((r) => r.trim().toLowerCase()));
      const evidence = [...cited].flatMap((ref) => {
        const result = refs.get(ref);
        if (!result) {
          ignored.add(ref);
          return [];
        }
        return [
          {
            finding_id: finding.id,
            type: 'TOOL_OUTPUT' as const,
            scan_result_id: result.id,
            content: redact(JSON.stringify(result.data)).slice(0, 4000),
            created_by: createdBy,
          },
        ];
      });
      if (evidence.length > 0) await tx.evidence.createMany({ data: evidence });
    }

    return { analysis_id: analysis.id, findings_created: findingIds.length, finding_ids: findingIds, ignored_refs: [...ignored], skipped_duplicates: skipped };
  });
}
