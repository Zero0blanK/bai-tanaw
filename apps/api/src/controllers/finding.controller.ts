import { AddEvidenceBody, CreateFindingBody, DashboardQuery, ListFindingsQuery, SetRemediationBody, VerifyFindingBody } from '@tanaw/shared';
import type { Request, Response } from 'express';
import { findingService } from '../services/finding.service.js';
import { insightsService } from '../services/insights.service.js';
import { accepted, created, ok, paginationMeta } from '../utils/apiResponse.js';
import { currentActor } from '../utils/request.js';
import { IdParams } from '../validations/common.js';

export const findingController = {
  async list(req: Request, res: Response) {
    const filters = ListFindingsQuery.parse(req.query);
    const { items, total } = await findingService.list(filters);
    ok(res, items, undefined, paginationMeta(filters.page, filters.limit, total));
  },

  async create(req: Request, res: Response) {
    created(res, await findingService.createManual(CreateFindingBody.parse(req.body), currentActor(req)), 'Finding created');
  },

  async get(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    ok(res, await findingService.get(id));
  },

  async verify(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    ok(res, await findingService.verify(id, VerifyFindingBody.parse(req.body), currentActor(req)), 'Finding verified');
  },

  async setRemediation(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    ok(res, await findingService.setRemediation(id, SetRemediationBody.parse(req.body), currentActor(req)), 'Remediation saved');
  },

  async addEvidence(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    const body = AddEvidenceBody.parse(req.body ?? {});
    created(res, await findingService.addEvidence(id, body, req.file, currentActor(req)), 'Evidence added');
  },

  async evidenceFile(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    const file = await findingService.evidenceFile(id);
    res.setHeader('content-type', file.contentType);
    res.setHeader('content-disposition', `${file.image ? 'inline' : 'attachment'}; filename="${file.filename}"`);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('content-security-policy', "default-src 'none'; sandbox");
    res.send(file.body);
  },

  async retest(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    accepted(res, await findingService.retest(id, currentActor(req)), 'Retest queued');
  },

  async dashboard(req: Request, res: Response) {
    const { target_id } = DashboardQuery.parse(req.query);
    ok(res, await insightsService.dashboard(target_id));
  },

  async report(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    ok(res, await insightsService.report(id, currentActor(req)));
  },
};
