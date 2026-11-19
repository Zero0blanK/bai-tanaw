import { Router } from 'express';
import { createAuditLogRouter } from './auditLog.routes.js';
import { createAuthRouter } from './auth.routes.js';
import { healthRouter } from './health.routes.js';
import { createJobRouter, createScanRouter, createTargetScanRouter } from './scan.routes.js';
import { createTargetRouter } from './target.routes.js';
import { createUserRouter } from './user.routes.js';

/** Every resource router is mounted here, under /api. Built per app so rate-limit state is per app. */
export function createApiRouter(): Router {
  const router = Router();
  router.use('/health', healthRouter);
  router.use('/auth', createAuthRouter());
  router.use('/users', createUserRouter());
  router.use('/targets', createTargetRouter());
  router.use('/targets', createTargetScanRouter());
  router.use('/scans', createScanRouter());
  router.use('/jobs', createJobRouter());
  router.use('/audit-logs', createAuditLogRouter());
  return router;
}
