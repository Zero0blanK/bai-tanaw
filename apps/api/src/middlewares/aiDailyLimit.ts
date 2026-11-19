import type { RequestHandler } from 'express';
import { aiService } from '../services/ai.service.js';
import { AuthenticationError } from '../utils/errors.js';

/**
 * Early 429 for users over AI_DAILY_LIMIT (OWASP LLM10). The services check again right before
 * queueing, so this is a fast path, not the only guard.
 */
export const aiDailyLimit: RequestHandler = async (req, _res, next) => {
  if (!req.user) throw new AuthenticationError();
  await aiService.assertUnderDailyLimit(req.user.id);
  next();
};
