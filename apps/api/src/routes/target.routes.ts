import { AddScopeRuleBody, CreateTargetBody, ScopeCheckBody, UpdateTargetBody } from '@tanaw/shared';
import { Router } from 'express';
import { targetController } from '../controllers/target.controller.js';
import { authenticate, requireRole, ROLE_GROUPS } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { IdParams, ScopeRuleParams } from '../validations/common.js';

export function createTargetRouter(): Router {
  const router = Router();
  const assessor = requireRole(...ROLE_GROUPS.assessor);
  const anyone = requireRole(...ROLE_GROUPS.anyone);

  router.use(authenticate);
  router.get('/', anyone, targetController.list);
  router.post('/', assessor, validate({ body: CreateTargetBody }), targetController.create);
  router.get('/:id', anyone, validate({ params: IdParams }), targetController.get);
  router.patch('/:id', assessor, validate({ params: IdParams, body: UpdateTargetBody }), targetController.update);

  router.post('/:id/scope', assessor, validate({ params: IdParams, body: AddScopeRuleBody }), targetController.addScopeRule);
  router.post('/:id/scope/check', assessor, validate({ params: IdParams, body: ScopeCheckBody }), targetController.checkScope);
  router.delete('/:id/scope/:ruleId', assessor, validate({ params: ScopeRuleParams }), targetController.deleteScopeRule);
  return router;
}
