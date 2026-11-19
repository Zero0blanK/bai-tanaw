import type { ApiResponse } from '@tanaw/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { AppError, NotFoundError } from '../utils/errors.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof ZodError) {
    const body: ApiResponse<null> = {
      success: false,
      message: 'Validation failed',
      data: null,
      errors: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
    res.status(400).json(body);
    return;
  }

  if (err instanceof AppError) {
    const body: ApiResponse<null> = {
      success: false,
      message: err.message,
      data: null,
      ...(err.errors ? { errors: err.errors } : {}),
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // body-parser errors (bad JSON, payload too large) carry a status.
  if (typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number' && err.status < 500) {
    const message = err.status === 413 ? 'Payload too large' : 'Malformed request body';
    res.status(err.status).json({ success: false, message, data: null } satisfies ApiResponse<null>);
    return;
  }

  logger.error('Unhandled error', { method: req.method, path: req.path, error: err });
  res.status(500).json({ success: false, message: 'Internal server error', data: null } satisfies ApiResponse<null>);
};
