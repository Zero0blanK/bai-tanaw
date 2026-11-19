import { uuid } from '@tanaw/shared';
import { z } from 'zod';

export const IdParams = z.object({ id: uuid('id') });

export const ScopeRuleParams = z.object({ id: uuid('id'), ruleId: uuid('ruleId') });

export const AuditLogQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().max(60).optional(),
  actor_id: uuid('actor_id').optional(),
  target_id: uuid('target_id').optional(),
});
