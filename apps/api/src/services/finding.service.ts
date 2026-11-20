import { randomUUID } from 'node:crypto';
import type { FindingStatus } from '@prisma/client';
import {
  cvss31BaseScore,
  RemediationSchema,
  type AddEvidenceInput,
  type CreateFindingInput,
  type ListFindingsInput,
  type ScanParams,
  type VerifyFindingInput,
} from '@tanaw/shared';
import { redact, storageKeys } from '@tanaw/shared/node';
import { storage } from '../config/storage.js';
import { findingRepository } from '../repositories/finding.repository.js';
import { scanRepository } from '../repositories/scan.repository.js';
import { targetRepository } from '../repositories/target.repository.js';
import { withTransaction } from '../repositories/transaction.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { auditService, type Actor } from './audit.service.js';
import { scanService } from './scan.service.js';

export const FINDING_MESSAGES = {
  NOT_FOUND: 'Finding not found',
  EVIDENCE_NOT_FOUND: 'Evidence not found',
  CONFIRM_NEEDS_SEVERITY: 'Confirming needs final_severity and cvss_score (or a cvss_vector to compute it)',
  CONFIRM_NEEDS_EVIDENCE: 'Attach at least one piece of evidence before confirming',
  CVSS_MISMATCH: 'cvss_score does not match cvss_vector',
  ANALYSIS_NOT_FOUND: 'Remediation draft not found for this finding',
  RETEST_NEEDS_CONFIRMED: 'Only confirmed findings can be retested',
  RETEST_MANUAL: 'This finding did not come from a tool run Bai-Tanaw can repeat; retest it by hand and attach evidence',
} as const;

/** The status machine (AGENT.md §7.2). Anything not listed is refused. */
export const ALLOWED_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  PENDING: ['CONFIRMED', 'REJECTED', 'FALSE_POSITIVE'],
  CONFIRMED: ['FIXED'],
  REJECTED: [],
  FALSE_POSITIVE: [],
  FIXED: [],
};

const IMAGE_TYPES: Array<{ ext: 'png' | 'jpg' | 'webp'; test: (b: Buffer) => boolean }> = [
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

/** Detects the file kind from its bytes, never from the client's filename or MIME type. */
export function detectEvidenceFile(buffer: Buffer): { ext: 'png' | 'jpg' | 'webp' | 'txt'; image: boolean } | null {
  const image = IMAGE_TYPES.find((t) => t.test(buffer));
  if (image) return { ext: image.ext, image: true };
  // Text evidence (HTTP exchanges, tool output): valid UTF-8 without NUL bytes.
  if (buffer.includes(0)) return null;
  const text = buffer.toString('utf8');
  if (text.includes('�')) return null;
  return { ext: 'txt', image: false };
}

function renderDraft(output: unknown): string {
  const draft = RemediationSchema.parse(output);
  return [
    draft.summary,
    '',
    ...draft.steps.map((step, i) => `${i + 1}. ${step}`),
    ...(draft.code_example ? ['', '```', draft.code_example, '```'] : []),
    ...(draft.references.length > 0 ? ['', 'References:', ...draft.references.map((r) => `- ${r}`)] : []),
  ].join('\n');
}

export const findingService = {
  list(filters: ListFindingsInput) {
    return findingRepository.list(filters);
  },

  async get(id: string) {
    const finding = await findingRepository.findDetail(id);
    if (!finding) throw new NotFoundError(FINDING_MESSAGES.NOT_FOUND);
    return { ...finding, allowed_transitions: ALLOWED_TRANSITIONS[finding.status] };
  },

  /** A finding from a hand test (e.g. an IDOR check). Starts PENDING like everything else. */
  async createManual(input: CreateFindingInput, actor: Actor) {
    const target = await targetRepository.findById(input.target_id);
    if (!target) throw new NotFoundError('Target not found');
    if (input.scan_id) {
      const scan = await scanRepository.findById(input.scan_id);
      if (!scan || scan.target_id !== input.target_id) throw new NotFoundError('Scan not found for this target');
    }
    const finding = await findingRepository.create({
      target_id: input.target_id,
      scan_id: input.scan_id ?? null,
      title: input.title,
      category: input.category,
      description: input.description,
      affected_asset: input.affected_asset,
      owasp_top10: input.owasp_top10 ?? null,
      wstg_id: input.wstg_id ?? null,
      source: 'MANUAL',
      status: 'PENDING',
    });
    await auditService.log('finding_created', actor, { target_id: input.target_id, metadata: { finding_id: finding.id, title: finding.title } });
    return finding;
  },

  /** The ONLY way a finding leaves PENDING (AGENT.md §2.5). Log + status change in one transaction. */
  async verify(id: string, input: VerifyFindingInput, actor: Actor & { id: string }) {
    const finding = await findingRepository.findById(id);
    if (!finding) throw new NotFoundError(FINDING_MESSAGES.NOT_FOUND);

    if (!ALLOWED_TRANSITIONS[finding.status].includes(input.status)) {
      const allowed = ALLOWED_TRANSITIONS[finding.status];
      throw new BadRequestError(
        `A ${finding.status} finding can't become ${input.status}` +
          (allowed.length > 0 ? ` (allowed: ${allowed.join(', ')})` : ' (it is closed)'),
      );
    }

    let cvssScore = input.cvss_score;
    if (input.cvss_vector) {
      const computed = cvss31BaseScore(input.cvss_vector);
      if (computed === null) throw new BadRequestError('cvss_vector must be a CVSS v3.1 base vector');
      if (cvssScore !== undefined && Math.abs(cvssScore - computed) > 0.05) {
        throw new BadRequestError(`${FINDING_MESSAGES.CVSS_MISMATCH} (the vector scores ${computed})`);
      }
      cvssScore = computed;
    }

    if (input.status === 'CONFIRMED') {
      if (!input.final_severity || cvssScore === undefined) throw new BadRequestError(FINDING_MESSAGES.CONFIRM_NEEDS_SEVERITY);
      if ((await findingRepository.countEvidence(id)) === 0) throw new BadRequestError(FINDING_MESSAGES.CONFIRM_NEEDS_EVIDENCE);
    }

    const updated = await withTransaction(async (tx) => {
      await findingRepository.addVerificationLog(
        { finding_id: id, assessor_id: actor.id, old_status: finding.status, new_status: input.status, notes: input.notes },
        tx,
      );
      return findingRepository.update(
        id,
        {
          status: input.status,
          ...(input.final_severity !== undefined ? { final_severity: input.final_severity } : {}),
          ...(cvssScore !== undefined ? { cvss_score: cvssScore } : {}),
          ...(input.cvss_vector !== undefined ? { cvss_vector: input.cvss_vector } : {}),
          ...(input.owasp_top10 !== undefined ? { owasp_top10: input.owasp_top10 } : {}),
          ...(input.wstg_id !== undefined ? { wstg_id: input.wstg_id } : {}),
        },
        tx,
      );
    });

    await auditService.log('finding_verified', actor, {
      target_id: finding.target_id,
      metadata: { finding_id: id, from: finding.status, to: input.status, final_severity: input.final_severity ?? null, cvss_score: cvssScore ?? null },
    });
    return updated;
  },

  /** Sets remediation text: written by hand, or accepted from an AI draft (never applied automatically). */
  async setRemediation(id: string, input: { remediation?: string | undefined; analysis_id?: string | undefined }, actor: Actor) {
    const finding = await findingRepository.findById(id);
    if (!finding) throw new NotFoundError(FINDING_MESSAGES.NOT_FOUND);

    let text = input.remediation;
    if (input.analysis_id) {
      const analysis = await findingRepository.findAnalysis(input.analysis_id);
      if (!analysis || analysis.finding_id !== id || analysis.task !== 'REMEDIATE') throw new NotFoundError(FINDING_MESSAGES.ANALYSIS_NOT_FOUND);
      text = renderDraft(analysis.output);
    }
    if (!text) throw new BadRequestError('Provide remediation text or an analysis_id');

    const updated = await findingRepository.update(id, { remediation: text });
    await auditService.log('remediation_set', actor, {
      target_id: finding.target_id,
      metadata: { finding_id: id, from_analysis: input.analysis_id ?? null },
    });
    return updated;
  },

  async addEvidence(id: string, input: AddEvidenceInput, file: { buffer: Buffer } | undefined, actor: Actor) {
    const finding = await findingRepository.findById(id);
    if (!finding) throw new NotFoundError(FINDING_MESSAGES.NOT_FOUND);

    if (input.scan_result_id) {
      const result = await findingRepository.findScanResult(input.scan_result_id);
      if (!result || result.scan.target_id !== finding.target_id) throw new NotFoundError('Scan result not found for this target');
    }

    const kind = file ? detectEvidenceFile(file.buffer) : null;
    if (file && !kind) throw new BadRequestError('Evidence files must be PNG, JPEG or WebP images, or UTF-8 text');
    if (input.type === 'SCREENSHOT' && !kind?.image) throw new BadRequestError('A SCREENSHOT needs an image file (PNG, JPEG or WebP)');
    if (input.type !== 'SCREENSHOT' && kind?.image) throw new BadRequestError('Image files are only accepted as SCREENSHOT evidence');
    if (!file && !input.content && !input.scan_result_id) throw new BadRequestError('Provide a file, content or a scan_result_id');

    const evidenceId = randomUUID();
    let filePath: string | null = null;
    if (file && kind) {
      // Text files are redacted like pasted content; images are stored as uploaded.
      const data = kind.image ? file.buffer : redact(file.buffer.toString('utf8'));
      filePath = await storage.put(storageKeys.evidence(finding.target_id, evidenceId, kind.ext), data);
    }

    const evidence = await findingRepository.createEvidence({
      id: evidenceId,
      finding_id: id,
      type: input.type,
      content: input.content ? redact(input.content) : null,
      file_path: filePath,
      scan_result_id: input.scan_result_id ?? null,
      created_by: actor.id ?? null,
    });
    await auditService.log('evidence_added', actor, {
      target_id: finding.target_id,
      metadata: { finding_id: id, evidence_id: evidence.id, type: input.type, has_file: Boolean(filePath) },
    });
    return evidence;
  },

  async evidenceFile(evidenceId: string) {
    const evidence = await findingRepository.findEvidence(evidenceId);
    if (!evidence?.file_path) throw new NotFoundError(FINDING_MESSAGES.EVIDENCE_NOT_FOUND);
    const ext = evidence.file_path.split('.').pop() ?? 'txt';
    const contentType = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[ext] ?? 'text/plain; charset=utf-8';
    return { body: await storage.get(evidence.file_path), contentType, image: ext !== 'txt', filename: `evidence-${evidence.id}.${ext}` };
  },

  /** Re-runs the tool scan that produced a confirmed finding, so the assessor can verify the fix. */
  async retest(id: string, actor: Actor & { id: string }) {
    const finding = await findingRepository.findById(id);
    if (!finding) throw new NotFoundError(FINDING_MESSAGES.NOT_FOUND);
    if (finding.status !== 'CONFIRMED') throw new BadRequestError(FINDING_MESSAGES.RETEST_NEEDS_CONFIRMED);
    const scan = finding.scan_id ? await scanRepository.findById(finding.scan_id) : null;
    if (!scan || scan.source !== 'WORKER' || scan.tool === 'MANUAL') throw new BadRequestError(FINDING_MESSAGES.RETEST_MANUAL);

    const params = (scan.params ?? {}) as ScanParams;
    return scanService.start(
      finding.target_id,
      {
        tool: scan.tool,
        ...(params.url ? { url: params.url } : {}),
        ...(params.host ? { host: params.host } : {}),
        ...(params.ports ? { ports: params.ports } : {}),
      },
      actor,
    );
  },
};
