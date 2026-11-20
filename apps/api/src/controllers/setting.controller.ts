import { AiSettingsBody } from '@tanaw/shared';
import type { Request, Response } from 'express';
import { settingService } from '../services/setting.service.js';
import { ok } from '../utils/apiResponse.js';
import { currentActor } from '../utils/request.js';

export const settingController = {
  async getAi(_req: Request, res: Response) {
    ok(res, await settingService.getAi());
  },

  async updateAi(req: Request, res: Response) {
    ok(res, await settingService.updateAi(AiSettingsBody.parse(req.body), currentActor(req)), 'AI settings saved');
  },

  async testAi(_req: Request, res: Response) {
    ok(res, await settingService.testAi());
  },
};
