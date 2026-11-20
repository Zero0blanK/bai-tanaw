// Queues the two AI features (AGENT.md §7.5). The worker does the calls; the API only checks that the call
// can run (provider configured, input ready, under the daily cap) and records who asked.

import { AUTO_INTERPRET_TOOLS, startOfManilaDay } from '@tanaw/shared';
import { env } from '../config/env.js';
import { aiRepository, findingLookup } from '../repositories/ai.repository.js';
import { jobRepository } from '../repositories/job.repository.js';
import { scanRepository } from '../repositories/scan.repository.js';
import { BadRequestError, NotFoundError, ServiceUnavailableError, TooManyRequestsError } from '../utils/errors.js';
import { auditService, type Actor } from './audit.service.js';
import { jobService } from './job.service.js';
import { settingService } from './setting.service.js';

export const AI_MESSAGES = {
  NOT_CONFIGURED: 'AI is not configured. An admin can add the provider API key in Settings.',
  DAILY_LIMIT: 'Daily AI limit reached. It resets at midnight (Philippine time).',
  SCAN_NOT_DONE: 'Only finished scans can be interpreted',
  SCAN_EMPTY: 'This scan has no results to interpret',
} as const;

export { startOfManilaDay };

export const aiService = {
  /** 503 before queueing a job that can't run: no key in Settings, or one that can't be decrypted. Ollama needs no key. */
  async assertConfigured(): Promise<void> {
    const ai = await settingService.resolveAi();
    if (!ai.configured) throw new ServiceUnavailableError(ai.problem ?? AI_MESSAGES.NOT_CONFIGURED);
  },

  /** Today's AI calls for one user, plus whether AI is set up at all (no provider details for non-admins). */
  async usage(userId: string) {
    const [used, ai] = await Promise.all([aiRepository.countJobsSince(userId, startOfManilaDay()), settingService.resolveAi()]);
    return { used, limit: env.AI_DAILY_LIMIT, remaining: Math.max(0, env.AI_DAILY_LIMIT - used), configured: ai.configured };
  },

  async assertUnderDailyLimit(userId: string): Promise<void> {
    const { remaining } = await this.usage(userId);
    if (remaining <= 0) throw new TooManyRequestsError(AI_MESSAGES.DAILY_LIMIT);
  },

  /**
   * The automatic interpretation after an import (the worker does the same after tool runs). Never throws:
   * a skip (no key, cap reached, nothing to read) is returned as a reason.
   */
  async autoInterpret(
    scan: { id: string; tool: string; target_id: string; results: number },
    actor: Actor,
  ): Promise<{ queued: true; job_id: string } | { queued: false; reason: string }> {
    if (!AUTO_INTERPRET_TOOLS.includes(scan.tool)) return { queued: false, reason: `${scan.tool} results are not sent to the AI` };
    if (scan.results === 0) return { queued: false, reason: 'no results to interpret' };
    if (!actor.id) return { queued: false, reason: 'no user to charge the AI call to' };
    const ai = await settingService.resolveAi();
    if (!ai.configured) return { queued: false, reason: ai.problem ?? AI_MESSAGES.NOT_CONFIGURED };
    if ((await this.usage(actor.id)).remaining <= 0) return { queued: false, reason: 'daily AI limit reached' };
    const job = await jobRepository.create({ type: 'INTERPRET', ref_id: scan.id, created_by: actor.id });
    try {
      await jobService.dispatch(job);
    } catch {
      return { queued: false, reason: 'queue unavailable' };
    }
    await auditService.log('ai_requested', actor, {
      target_id: scan.target_id,
      metadata: { task: 'INTERPRET', scan_id: scan.id, job_id: job.id, auto: true },
    });
    return { queued: true, job_id: job.id };
  },

  async requestInterpret(scanId: string, actor: Actor & { id: string }) {
    await this.assertConfigured();
    const scan = await scanRepository.findDetail(scanId);
    if (!scan) throw new NotFoundError('Scan not found');
    if (scan.status !== 'DONE') throw new BadRequestError(AI_MESSAGES.SCAN_NOT_DONE);
    if (scan._count.results === 0) throw new BadRequestError(AI_MESSAGES.SCAN_EMPTY);
    await this.assertUnderDailyLimit(actor.id);

    const job = await jobRepository.create({ type: 'INTERPRET', ref_id: scan.id, created_by: actor.id });
    const queued = await jobService.dispatch(job);
    await auditService.log('ai_requested', actor, { target_id: scan.target_id, metadata: { task: 'INTERPRET', scan_id: scan.id, job_id: job.id } });
    return { job: queued };
  },

  async requestRemediation(findingId: string, actor: Actor & { id: string }) {
    await this.assertConfigured();
    const finding = await findingLookup.findById(findingId);
    if (!finding) throw new NotFoundError('Finding not found');
    await this.assertUnderDailyLimit(actor.id);

    const job = await jobRepository.create({ type: 'REMEDIATE', ref_id: finding.id, created_by: actor.id });
    const queued = await jobService.dispatch(job);
    await auditService.log('ai_requested', actor, {
      target_id: finding.target_id,
      metadata: { task: 'REMEDIATE', finding_id: finding.id, job_id: job.id },
    });
    return { job: queued };
  },

  async listForScan(scanId: string) {
    if (!(await scanRepository.findById(scanId))) throw new NotFoundError('Scan not found');
    return aiRepository.listForScan(scanId);
  },

  async listForFinding(findingId: string) {
    if (!(await findingLookup.findById(findingId))) throw new NotFoundError('Finding not found');
    return aiRepository.listForFinding(findingId);
  },
};
