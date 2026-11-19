// Feature 2: Suggesting vulnerability remediation. The reply is stored as a DRAFT in ai_analyses only;
// the finding's remediation changes only when an assessor accepts or edits it (PATCH /findings/:id/remediation).

import type { Prisma } from '@prisma/client';
import { RemediationJsonSchema, RemediationSchema } from '@tanaw/shared';
import { prisma } from '../config/prisma.js';
import { askJson as defaultAskJson, type AskJson } from '../ai/provider.js';
import { REMEDIATE_SYSTEM_PROMPT } from '../ai/prompts/remediate.js';
import { STACK_CONTEXT } from '../ai/prompts/stackContext.js';

export const MAX_EVIDENCE_ITEMS = 8;
const MAX_EVIDENCE_CHARS = 800;

export interface RemediateOutcome {
  analysis_id: string;
  confidence: string;
}

export async function runRemediate(findingId: string, createdBy: string | null, askJson: AskJson = defaultAskJson): Promise<RemediateOutcome> {
  const finding = await prisma.finding.findUnique({
    where: { id: findingId },
    include: {
      evidence: { orderBy: { created_at: 'asc' }, take: MAX_EVIDENCE_ITEMS, include: { scan_result: true } },
    },
  });
  if (!finding) throw new Error(`Finding ${findingId} not found`);

  const evidence = finding.evidence.map((e, index) => {
    const data = e.scan_result ? JSON.stringify(e.scan_result.data) : (e.content ?? (e.file_path ? '(file attached)' : ''));
    return `e${index + 1} ${e.type} ${data.slice(0, MAX_EVIDENCE_CHARS)}`;
  });

  const untrusted = [
    `Finding: ${finding.title}`,
    `Category: ${finding.category}`,
    `Status: ${finding.status}`,
    `Affected asset: ${finding.affected_asset}`,
    `OWASP Top 10: ${finding.owasp_top10 ?? 'N/A'} | WSTG: ${finding.wstg_id ?? 'N/A'}`,
    `Severity: ${finding.final_severity ?? finding.ai_severity ?? 'not set'}`,
    `Description: ${finding.description}`,
    'Evidence:',
    ...(evidence.length > 0 ? evidence : ['(no evidence attached)']),
  ].join('\n');

  const ai = await askJson({
    task: 'remediate',
    system: REMEDIATE_SYSTEM_PROMPT,
    context: STACK_CONTEXT,
    untrusted,
    schema: RemediationSchema,
    jsonSchema: RemediationJsonSchema,
  });

  const analysis = await prisma.aiAnalysis.create({
    data: {
      finding_id: finding.id,
      scan_id: finding.scan_id,
      task: 'REMEDIATE',
      provider: ai.provider,
      model: ai.model,
      input_hash: ai.inputHash,
      output: ai.result as Prisma.InputJsonValue,
      tokens_in: ai.tokensIn,
      tokens_out: ai.tokensOut,
      created_by: createdBy,
    },
  });
  return { analysis_id: analysis.id, confidence: ai.result.confidence };
}
