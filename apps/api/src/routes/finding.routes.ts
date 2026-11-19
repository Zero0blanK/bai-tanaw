import { CreateFindingBody, DashboardQuery, ListFindingsQuery, SetRemediationBody, VerifyFindingBody } from '@tanaw/shared';
import { Router } from 'express';
import { findingController } from '../controllers/finding.controller.js';
import { authenticate, requireRole, ROLE_GROUPS } from '../middlewares/auth.js';
import { singleFile } from '../middlewares/upload.js';
import { validate } from '../middlewares/validate.js';
import { IdParams } from '../validations/common.js';

/** Mounted under /findings (the AI routes for findings live in ai.routes.ts). */
export function createFindingRouter(): Router {
  const router = Router();
  const assessor = requireRole(...ROLE_GROUPS.assessor);
  const anyone = requireRole(...ROLE_GROUPS.anyone);
  router.use(authenticate);
  router.get('/', anyone, validate({ query: ListFindingsQuery }), findingController.list);
  router.post('/', assessor, validate({ body: CreateFindingBody }), findingController.create);
  router.get('/:id', anyone, validate({ params: IdParams }), findingController.get);
  router.patch('/:id/verify', assessor, validate({ params: IdParams, body: VerifyFindingBody }), findingController.verify);
  router.patch('/:id/remediation', assessor, validate({ params: IdParams, body: SetRemediationBody }), findingController.setRemediation);
  // Multipart (with optional "file") or JSON; the body is validated in the controller after multer runs.
  router.post('/:id/evidence', assessor, validate({ params: IdParams }), singleFile('file', { required: false }), findingController.addEvidence);
  router.post('/:id/retest', assessor, validate({ params: IdParams }), findingController.retest);
  return router;
}

/** Mounted under /api: evidence files, dashboard and report. */
export function createInsightsRouter(): Router {
  const router = Router();
  const anyone = requireRole(...ROLE_GROUPS.anyone);
  router.get('/evidence/:id/file', authenticate, anyone, validate({ params: IdParams }), findingController.evidenceFile);
  router.get('/dashboard', authenticate, anyone, validate({ query: DashboardQuery }), findingController.dashboard);
  router.get('/targets/:id/report', authenticate, anyone, validate({ params: IdParams }), findingController.report);
  return router;
}
