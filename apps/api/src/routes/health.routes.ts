import { Router } from 'express';
import { env } from '../config/env.js';
import { ok } from '../utils/apiResponse.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  ok(res, { status: 'ok', service: `${env.APP_NAME} API`, time: new Date().toISOString() });
});
