import { normalizeHost, parseHttpUrl, type AddScopeRuleInput, type CreateTargetInput, type ScopeCheckInput, type UpdateTargetInput } from '@tanaw/shared';
import { scopeRuleRepository, targetRepository } from '../repositories/target.repository.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { auditService, type Actor } from './audit.service.js';
import { scopeService } from './scope.service.js';

export const TARGET_MESSAGES = {
  NOT_FOUND: 'Target not found',
  RULE_NOT_FOUND: 'Scope rule not found',
  INVALID_URL: 'base_url must be a valid http(s) URL without credentials',
  BAD_WINDOW: 'test_window_end must be after test_window_start',
} as const;

/** "https://Host.dev/app/" → "https://host.dev/app" (no query, hash or trailing slash). */
function normalizeBaseUrl(url: URL): string {
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

export const targetService = {
  async create(input: CreateTargetInput, actor: Actor) {
    const url = parseHttpUrl(input.base_url);
    if (!url) throw new BadRequestError(TARGET_MESSAGES.INVALID_URL);
    await scopeService.assertHostAllowed(url.hostname, actor, 'target_create', { value: input.base_url });

    const target = await targetRepository.create({
      name: input.name,
      base_url: normalizeBaseUrl(url),
      description: input.description ?? null,
      authorization_note: input.authorization_note ?? null,
      test_window_start: input.test_window_start ?? null,
      test_window_end: input.test_window_end ?? null,
      created_by: actor.id ?? null,
    });
    await auditService.log('target_created', actor, {
      target_id: target.id,
      metadata: { name: target.name, base_url: target.base_url },
    });
    return target;
  },

  list() {
    return targetRepository.list();
  },

  async get(id: string) {
    const target = await targetRepository.findById(id);
    if (!target) throw new NotFoundError(TARGET_MESSAGES.NOT_FOUND);
    return target;
  },

  /** base_url is fixed after creation: register a new target instead of moving one. */
  async update(id: string, input: UpdateTargetInput, actor: Actor) {
    const existing = await this.get(id);
    const start = input.test_window_start ?? existing.test_window_start;
    const end = input.test_window_end ?? existing.test_window_end;
    if (start && end && start > end) throw new BadRequestError(TARGET_MESSAGES.BAD_WINDOW);

    const target = await targetRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.authorization_note !== undefined ? { authorization_note: input.authorization_note } : {}),
      ...(input.test_window_start !== undefined ? { test_window_start: input.test_window_start } : {}),
      ...(input.test_window_end !== undefined ? { test_window_end: input.test_window_end } : {}),
    });
    await auditService.log('target_updated', actor, { target_id: id, metadata: { changes: Object.keys(input) } });
    return target;
  },

  /** In-scope HOST/URL rules can never widen scope past the allowlist; out-of-scope rules may name anything. */
  async addScopeRule(targetId: string, input: AddScopeRuleInput, actor: Actor) {
    await this.get(targetId);
    let value = input.value.trim();

    if (input.asset_type === 'HOST') {
      value = normalizeHost(value);
      if (input.in_scope) await scopeService.assertHostAllowed(value, actor, 'scope_rule', { target_id: targetId, value });
    }
    if (input.asset_type === 'URL') {
      const url = parseHttpUrl(value);
      if (!url) throw new BadRequestError('URL value must be a valid http(s) URL');
      if (input.in_scope) {
        await scopeService.assertHostAllowed(url.hostname, actor, 'scope_rule', { target_id: targetId, value });
      }
      value = url.toString();
    }
    if (input.asset_type === 'PORT_RANGE') value = value.replace(/\s+/g, '');

    const rule = await scopeRuleRepository.create({
      target_id: targetId,
      asset_type: input.asset_type,
      value,
      in_scope: input.in_scope,
      notes: input.notes ?? null,
    });
    await auditService.log('scope_rule_added', actor, {
      target_id: targetId,
      metadata: { rule_id: rule.id, asset_type: rule.asset_type, value: rule.value, in_scope: rule.in_scope },
    });
    return rule;
  },

  async deleteScopeRule(targetId: string, ruleId: string, actor: Actor) {
    const rule = await scopeRuleRepository.findForTarget(targetId, ruleId);
    if (!rule) throw new NotFoundError(TARGET_MESSAGES.RULE_NOT_FOUND);
    await scopeRuleRepository.delete(rule.id);
    await auditService.log('scope_rule_deleted', actor, {
      target_id: targetId,
      metadata: { rule_id: rule.id, asset_type: rule.asset_type, value: rule.value, in_scope: rule.in_scope },
    });
  },

  /** Dry run for the UI: says whether a URL/host/port is in scope, without auditing. */
  async checkScope(targetId: string, input: ScopeCheckInput) {
    const target = await targetRepository.findForScope(targetId);
    if (!target) throw new NotFoundError(TARGET_MESSAGES.NOT_FOUND);
    return scopeService.check(target, input);
  },

  /** For later phases (scans, imports): load the target and enforce scope, auditing blocks. */
  async assertInScope(targetId: string, request: ScopeCheckInput, actor: Actor, context: 'scan' | 'import') {
    const target = await targetRepository.findForScope(targetId);
    if (!target) throw new NotFoundError(TARGET_MESSAGES.NOT_FOUND);
    await scopeService.assertInScope(target, request, actor, context);
    return target;
  },
};
