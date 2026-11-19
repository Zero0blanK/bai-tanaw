import type { Request, Response } from 'express';
import { aiService } from '../services/ai.service.js';
import { accepted, ok } from '../utils/apiResponse.js';
import { AuthenticationError } from '../utils/errors.js';
import { currentActor } from '../utils/request.js';
import { IdParams } from '../validations/common.js';

export const aiController = {
  async interpret(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    accepted(res, await aiService.requestInterpret(id, currentActor(req)), 'AI interpretation queued');
  },

  async listForScan(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    ok(res, await aiService.listForScan(id));
  },

  async remediate(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    accepted(res, await aiService.requestRemediation(id, currentActor(req)), 'AI remediation draft queued');
  },

  async listForFinding(req: Request, res: Response) {
    const { id } = IdParams.parse(req.params);
    ok(res, await aiService.listForFinding(id));
  },

  async usage(req: Request, res: Response) {
    if (!req.user) throw new AuthenticationError();
    ok(res, await aiService.usage(req.user.id));
  },
};
