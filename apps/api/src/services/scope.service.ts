// API-side wrapper around the shared scope logic (AGENT.md §7.3): same checks as the worker,
// plus the audit row and the 403 when something is blocked.

import { checkScope, isHostAllowed, type ScopedTarget, type ScopeRequest } from '@tanaw/shared';
import { env } from '../config/env.js';
import { AuthorizationError } from '../utils/errors.js';
import { auditService, type Actor } from './audit.service.js';

export const SCOPE_MESSAGES = {
  OUT_OF_SCOPE: 'Request is outside the authorized scope',
  HOST_NOT_ALLOWED: 'This host is not on the assessment allowlist (ASSESSMENT_ALLOWED_HOSTS)',
} as const;

export type ScopeContext = 'target_create' | 'scope_rule' | 'scan' | 'import' | 'check';

export const scopeService = {
  /** Pure decision, no side effects. Used by the dry-run endpoint and the UI. */
  check(target: ScopedTarget, request: ScopeRequest) {
    return checkScope(target, request, env.ALLOWED_HOSTS);
  },

  /** Throws 403 and writes a `scope_blocked` audit row when the request is out of scope. */
  async assertInScope(
    target: ScopedTarget & { id: string },
    request: ScopeRequest,
    actor: Actor,
    context: ScopeContext,
  ): Promise<void> {
    const decision = checkScope(target, request, env.ALLOWED_HOSTS);
    if (decision.ok) return;
    await auditService.log('scope_blocked', actor, {
      target_id: target.id,
      metadata: { context, request: { ...request }, reason: decision.reason },
    });
    throw new AuthorizationError(`${SCOPE_MESSAGES.OUT_OF_SCOPE}: ${decision.reason}`);
  },

  /** Allowlist-only check, for registering targets and in-scope rules (there is no target scope yet to check). */
  async assertHostAllowed(
    host: string,
    actor: Actor,
    context: ScopeContext,
    details: { target_id?: string; value?: string } = {},
  ): Promise<void> {
    if (isHostAllowed(host, env.ALLOWED_HOSTS)) return;
    await auditService.log('scope_blocked', actor, {
      ...(details.target_id ? { target_id: details.target_id } : {}),
      metadata: { context, host, ...(details.value ? { value: details.value } : {}), reason: 'host not on allowlist' },
    });
    throw new AuthorizationError(SCOPE_MESSAGES.HOST_NOT_ALLOWED);
  },
};
