import type { Role } from '@tanaw/shared';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { durationToMs } from './crypto.js';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

const ISSUER = 'tanaw-api';
const AUDIENCE = 'tanaw-web';

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({ role: payload.role }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: payload.sub,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: Math.floor(durationToMs(env.JWT_ACCESS_TTL) / 1000),
  });
}

/** Throws on a bad signature, wrong algorithm, issuer/audience mismatch or expiry. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.role !== 'string') {
    throw new Error('Malformed access token');
  }
  return { sub: decoded.sub, role: decoded.role as Role };
}
