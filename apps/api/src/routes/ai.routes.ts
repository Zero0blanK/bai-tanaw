import { Router } from 'express';
import { aiController } from '../controllers/ai.controller.js';
import { aiDailyLimit } from '../middlewares/aiDailyLimit.js';
import { authenticate, requireRole, ROLE_GROUPS } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { IdParams } from '../validations/common.js';

/** Mounted under /scans. */
export function createScanAiRouter(): Router {
  const router = Router();
  router.post('/:id/interpret', authenticate, requireRole(...ROLE_GROUPS.assessor), validate({ params: IdParams }), aiDailyLimit, aiController.interpret);
  router.get('/:id/ai', authenticate, requireRole(...ROLE_GROUPS.anyone), validate({ params: IdParams }), aiController.listForScan);
  return router;
}

/** Mounted under /findings. */
export function createFindingAiRouter(): Router {
  const router = Router();
  router.post('/:id/remediation', authenticate, requireRole(...ROLE_GROUPS.assessor), validate({ params: IdParams }), aiDailyLimit, aiController.remediate);
  router.get('/:id/ai', authenticate, requireRole(...ROLE_GROUPS.anyone), validate({ params: IdParams }), aiController.listForFinding);
  return router;
}

/** Mounted under /ai. */
export function createAiRouter(): Router {
  const router = Router();
  router.get('/usage', authenticate, requireRole(...ROLE_GROUPS.anyone), aiController.usage);
  return router;
}
