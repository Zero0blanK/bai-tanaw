// After a scan finishes, the AI interpretation is queued automatically (no button). It is skipped, never forced,
// when AI isn't set up, the scan has nothing worth reading, or the person who started the scan used up their daily
// AI calls. Same limits as a manual request: the job counts against that person's daily AI cap.

import { AUTO_INTERPRET_TOOLS, startOfManilaDay } from '@tanaw/shared';
import { AI_SETTINGS_KEY, resolveAiSettings } from '@tanaw/shared/node';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';
import { enqueueJob } from './queue.js';

export type AutoInterpretOutcome = { queued: true; job_id: string } | { queued: false; reason: string };

export interface AutoInterpretScan {
  id: string;
  tool: string;
  target_id: string;
  actor_id: string | null;
  results: number;
}

export async function queueAutoInterpret(scan: AutoInterpretScan, enqueue = enqueueJob): Promise<AutoInterpretOutcome> {
  if (!AUTO_INTERPRET_TOOLS.includes(scan.tool)) return { queued: false, reason: `${scan.tool} results are not sent to the AI` };
  if (scan.results === 0) return { queued: false, reason: 'no results to interpret' };
  if (!scan.actor_id) return { queued: false, reason: 'scan has no owner to charge the AI call to' };

  const row = await prisma.appSetting.findUnique({ where: { key: AI_SETTINGS_KEY } });
  const ai = resolveAiSettings(row, env.SETTINGS_ENCRYPTION_KEY);
  if (!ai.configured) return { queued: false, reason: ai.problem ?? 'AI is not configured' };

  const used = await prisma.job.count({
    where: { created_by: scan.actor_id, type: { in: ['INTERPRET', 'REMEDIATE'] }, created_at: { gte: startOfManilaDay() } },
  });
  if (used >= env.AI_DAILY_LIMIT) return { queued: false, reason: 'daily AI limit reached' };

  const job = await prisma.job.create({ data: { type: 'INTERPRET', ref_id: scan.id, created_by: scan.actor_id } });
  try {
    const bullId = await enqueue('INTERPRET', job.id);
    await prisma.job.update({ where: { id: job.id }, data: { bull_job_id: bullId } });
  } catch (error) {
    await prisma.job.update({ where: { id: job.id }, data: { status: 'FAILED', failed_reason: 'Queue unavailable', finished_at: new Date() } });
    logger.error('Auto interpretation could not be queued', { scan_id: scan.id, error: (error as Error).message });
    return { queued: false, reason: 'queue unavailable' };
  }
  await prisma.auditLog.create({
    data: {
      action: 'ai_requested',
      actor_id: scan.actor_id,
      target_id: scan.target_id,
      metadata: { task: 'INTERPRET', scan_id: scan.id, job_id: job.id, auto: true },
    },
  });
  logger.info('Auto interpretation queued', { scan_id: scan.id, job_id: job.id });
  return { queued: true, job_id: job.id };
}
