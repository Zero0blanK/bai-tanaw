import type { Role } from '@tanaw/shared';
import type { RequestHandler } from 'express';
import { MESSAGES } from '../constants/auth.js';
import { userRepository } from '../repositories/user.repository.js';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';
import { verifyAccessToken } from '../utils/jwt.js';

/**
 * Requires a valid Bearer access token. The user is re-read on every request, so deactivation and
 * role changes apply immediately (the token's role claim is only a hint for the client).
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  // Several routers share a path prefix (e.g. /targets); authenticate once per request.
  if (req.user) {
    next();
    return;
  }
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) throw new AuthenticationError(MESSAGES.TOKEN_REQUIRED);

  let userId: string;
  try {
    userId = verifyAccessToken(token).sub;
  } catch {
    throw new AuthenticationError(MESSAGES.TOKEN_INVALID);
  }

  const user = await userRepository.findPublicById(userId);
  if (!user || !user.is_active) throw new AuthenticationError(MESSAGES.TOKEN_INVALID);
  req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  next();
};

/** Must run after authenticate. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new AuthenticationError(MESSAGES.TOKEN_REQUIRED);
    if (!roles.includes(req.user.role)) throw new AuthorizationError();
    next();
  };
}

/** Shorthands for the three roles. */
export const ROLE_GROUPS = {
  admin: ['ADMIN'],
  assessor: ['ADMIN', 'ASSESSOR'],
  anyone: ['ADMIN', 'ASSESSOR', 'VIEWER'],
} as const satisfies Record<string, Role[]>;
