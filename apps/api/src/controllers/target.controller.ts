import { AddScopeRuleBody, CreateTargetBody, ScopeCheckBody, UpdateTargetBody } from '@tanaw/shared';
import type { Request, Response } from 'express';
import { targetService } from '../services/target.service.js';
import { created, ok } from '../utils/apiResponse.js';
import { currentActor } from '../utils/request.js';
import { IdParams, ScopeRuleParams } from '../validations/common.js';

export const targetController = {
  async create(req: Request, res: Response) {
    created(res, await targetService.create(CreateTargetBody.parse(req.body), currentActor(req)), 'Target registered');
  },

  async list(_req: Request, res: Response) {
    ok(res, await targetService.list());
  },

  async get(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    ok(res, await targetService.get(id));
  },

  async update(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    ok(res, await targetService.update(id, UpdateTargetBody.parse(req.body), currentActor(req)), 'Target updated');
  },

  async addScopeRule(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    created(res, await targetService.addScopeRule(id, AddScopeRuleBody.parse(req.body), currentActor(req)), 'Scope rule added');
  },

  async deleteScopeRule(req: Request, res: Response) {
    const { id, ruleId } = ScopeRuleParams.parse(req.params);
    await targetService.deleteScopeRule(id, ruleId, currentActor(req));
    ok(res, null, 'Scope rule deleted');
  },

  async checkScope(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    ok(res, await targetService.checkScope(id, ScopeCheckBody.parse(req.body)));
  },
};
