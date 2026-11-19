import type { Request } from 'express';
import type { Actor } from '../services/audit.service.js';
import type { ClientContext } from '../services/auth.service.js';
import { AuthenticationError } from './errors.js';

export function clientContext(req: Request): ClientContext {
  return { id: req.user?.id, ip: req.ip, userAgent: req.get('user-agent') };
}

/** The authenticated actor. Only call behind the authenticate middleware. */
export function currentActor(req: Request): Actor & { id: string } {
  if (!req.user) throw new AuthenticationError();
  return { id: req.user.id, ip: req.ip };
}
