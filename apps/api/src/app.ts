import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/error.js';
import { createApiRouter } from './routes/index.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  // One reverse proxy (or none) in front of the API; needed for correct req.ip in rate limits and audit logs.
  app.set('trust proxy', 1);

  app.use(helmet());
  // Helmet doesn't set Permissions-Policy. A JSON API needs no browser features, so deny them all.
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
    next();
  });
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api', createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
