import { createHmac, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Compared against when the email doesn't exist, so a login takes the same time either way.
let dummyHash: string | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= await bcrypt.hash('not-a-real-password', env.BCRYPT_ROUNDS);
  await bcrypt.compare(password, dummyHash);
}

/** 256-bit random token for the refresh cookie. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only this keyed hash is stored, so a database leak can't be replayed as sessions. */
export function hashRefreshToken(token: string): string {
  return createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

/** "15m" / "7d" / "3600s" / "2h" → milliseconds. Format is validated in env.ts. */
export function durationToMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return Number(match[1]) * unit;
}
