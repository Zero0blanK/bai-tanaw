// Worker-side scope enforcement: the same shared checks the API ran when the scan was queued,
// re-run at execution time because scope rules or the allowlist may have changed since.

import { checkScope, type ScopedTarget, type ScopeRequest } from '@tanaw/shared';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';

export class ScopeBlockedError extends Error {
  constructor(public readonly reason: string) {
    super(`Request is outside the authorized scope: ${reason}`);
    this.name = 'ScopeBlockedError';
  }
}

export interface ScopeGuardTarget extends ScopedTarget {
  id: string;
  test_window_start: Date | null;
  test_window_end: Date | null;
}

/** Builds the guard a tool uses for every request it makes. Blocks are audited once per distinct request. */
export function createScopeGuard(target: ScopeGuardTarget, actorId: string | null, scanId: string) {
  const logged = new Set<string>();

  async function audit(request: ScopeRequest, reason: string) {
    const key = JSON.stringify([request.url, request.host, request.port]);
    if (logged.has(key)) return;
    logged.add(key);
    await prisma.auditLog.create({
      data: {
        action: 'scope_blocked',
        actor_id: actorId,
        target_id: target.id,
        metadata: { context: 'scan', stage: 'worker', scan_id: scanId, request: { ...request }, reason },
      },
    });
  }

  return {
    /** Non-throwing check for optional requests (e.g. the HTTP→HTTPS probe, ZAP alert URLs). */
    async allows(request: ScopeRequest): Promise<boolean> {
      const decision = checkScope(target, request, env.ALLOWED_HOSTS);
      if (!decision.ok) await audit(request, decision.reason);
      return decision.ok;
    },

    /** Throws ScopeBlockedError (after auditing) if any request is out of scope. */
    async assertAll(requests: ScopeRequest[]): Promise<void> {
      for (const request of requests) {
        const decision = checkScope(target, request, env.ALLOWED_HOSTS);
        if (!decision.ok) {
          await audit(request, decision.reason);
          throw new ScopeBlockedError(decision.reason);
        }
      }
    },

    async assertWithinTestWindow(now = new Date()): Promise<void> {
      const { test_window_start: start, test_window_end: end } = target;
      if ((!start || now >= start) && (!end || now <= end)) return;
      const reason = 'outside the authorized test window';
      await audit({}, reason);
      throw new ScopeBlockedError(reason);
    },
  };
}

export type ScopeGuard = ReturnType<typeof createScopeGuard>;
