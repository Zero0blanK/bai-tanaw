import { Router } from 'express';
import { auditLogController } from '../controllers/auditLog.controller.js';
import { authenticate, requireRole, ROLE_GROUPS } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { AuditLogQuery } from '../validations/common.js';

export function createAuditLogRouter(): Router {
  const router = Router();
  router.get('/', authenticate, requireRole(...ROLE_GROUPS.admin), validate({ query: AuditLogQuery }), auditLogController.list);
  return router;
}
