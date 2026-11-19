import { ScanResultsQuery, StartScanBody } from '@tanaw/shared';
import { Router } from 'express';
import { scanController } from '../controllers/scan.controller.js';
import { authenticate, requireRole, ROLE_GROUPS } from '../middlewares/auth.js';
import { singleFile } from '../middlewares/upload.js';
import { validate } from '../middlewares/validate.js';
import { IdParams } from '../validations/common.js';

/** Mounted under /targets: starting scans, listing them, importing reports. */
export function createTargetScanRouter(): Router {
  const router = Router();
  const assessor = requireRole(...ROLE_GROUPS.assessor);
  router.use(authenticate);
  router.post('/:id/scans', assessor, validate({ params: IdParams, body: StartScanBody }), scanController.start);
  router.get('/:id/scans', requireRole(...ROLE_GROUPS.anyone), validate({ params: IdParams }), scanController.listForTarget);
  router.post('/:id/imports/nmap', assessor, validate({ params: IdParams }), singleFile(), scanController.importNmap);
  router.post('/:id/imports/zap', assessor, validate({ params: IdParams }), singleFile(), scanController.importZap);
  return router;
}

/** Mounted under /scans. Raw tool output may hold more detail than results, so it is assessor-only. */
export function createScanRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/:id', requireRole(...ROLE_GROUPS.anyone), validate({ params: IdParams, query: ScanResultsQuery }), scanController.get);
  router.get('/:id/raw', requireRole(...ROLE_GROUPS.assessor), validate({ params: IdParams }), scanController.raw);
  return router;
}

/** Mounted under /jobs. */
export function createJobRouter(): Router {
  const router = Router();
  router.get('/:id', authenticate, requireRole(...ROLE_GROUPS.anyone), validate({ params: IdParams }), scanController.job);
  return router;
}
