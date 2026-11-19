import { rateLimit } from 'express-rate-limit';
import { AUTH } from '../constants/auth.js';
import { TooManyRequestsError } from '../utils/errors.js';

/** Per-IP cap on login attempts, on top of the per-account lockout. One instance per app. */
export function createLoginLimiter() {
  return rateLimit({
    windowMs: AUTH.LOGIN_RATE_WINDOW_MS,
    limit: AUTH.LOGIN_RATE_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new TooManyRequestsError('Too many login attempts. Try again later.')),
  });
}
