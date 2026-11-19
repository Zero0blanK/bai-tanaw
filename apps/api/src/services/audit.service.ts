import type { Prisma } from '@prisma/client';
import { logger } from '../config/logger.js';
import { auditLogRepository, type AuditLogFilters } from '../repositories/auditLog.repository.js';

/** Who did something, and from where. Built from the request by `actorFrom(req)`. */
export interface Actor {
  id?: string | undefined;
  ip?: string | undefined;
}

export const AUDIT_ACTIONS = [
  'login_success',
  'login_failed',
  'login_locked',
  'logout',
  'refresh_reuse_detected',
  'user_created',
  'user_updated',
  'user_deleted',
  'target_created',
  'target_updated',
  'scope_rule_added',
  'scope_rule_deleted',
  'scope_blocked',
  'scan_started',
  'report_imported',
  'ai_requested',
  'finding_created',
  'finding_verified',
  'remediation_set',
  'evidence_added',
  'report_exported',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditService = {
  /**
   * Writes one audit row. Never throws: a failing audit write is logged, and must not turn a
   * successful (or a correctly rejected) request into a 500. Never put secrets in metadata.
   */
  async log(
    action: AuditAction,
    actor: Actor,
    details: { target_id?: string | undefined; metadata?: Prisma.InputJsonObject } = {},
  ): Promise<void> {
    try {
      await auditLogRepository.create({
        action,
        actor_id: actor.id ?? null,
        ip: actor.ip ?? null,
        target_id: details.target_id ?? null,
        ...(details.metadata ? { metadata: details.metadata } : {}),
      });
    } catch (error) {
      logger.error('Audit log write failed', { action, error });
    }
  },

  list(filters: AuditLogFilters) {
    return auditLogRepository.list(filters);
  },
};
