import { AiSettingsBody } from '@tanaw/shared';
import { Router } from 'express';
import { settingController } from '../controllers/setting.controller.js';
import { authenticate, requireRole, ROLE_GROUPS } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';

/** Admin-only. The AI key is write-only: GET returns whether one is stored, never the key. */
export function createSettingRouter(): Router {
  const router = Router();
  router.use(authenticate, requireRole(...ROLE_GROUPS.admin));
  router.get('/ai', settingController.getAi);
  router.put('/ai', validate({ body: AiSettingsBody }), settingController.updateAi);
  router.post('/ai/test', settingController.testAi);
  return router;
}
