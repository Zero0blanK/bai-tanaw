import { Router } from 'express';
import { healthRouter } from './health.routes.js';

/** Every resource router is mounted here, under /api. */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
