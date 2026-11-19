import { env } from '../config/env.js';
import { AUTH, MESSAGES } from '../constants/auth.js';
import { refreshTokenRepository } from '../repositories/refreshToken.repository.js';
import { withTransaction } from '../repositories/transaction.js';
import { userRepository, type PublicUser } from '../repositories/user.repository.js';
import { burnPasswordCheck, durationToMs, generateRefreshToken, hashRefreshToken, verifyPassword } from '../utils/crypto.js';
import { AuthenticationError, TooManyRequestsError } from '../utils/errors.js';
import { signAccessToken } from '../utils/jwt.js';
import { auditService, type Actor } from './audit.service.js';

export interface ClientContext extends Actor {
  userAgent?: string | undefined;
}

export interface Session {
  access_token: string;
  user: PublicUser;
  refresh: { token: string; expires_at: Date };
}

function toPublic(user: PublicUser & Record<string, unknown>): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    is_active: user.is_active,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function newRefreshToken() {
  const token = generateRefreshToken();
  return { token, token_hash: hashRefreshToken(token), expires_at: new Date(Date.now() + durationToMs(env.JWT_REFRESH_TTL)) };
}

export const authService = {
  async login(email: string, password: string, ctx: ClientContext): Promise<Session> {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      await burnPasswordCheck(password);
      await auditService.log('login_failed', ctx, { metadata: { email, reason: 'unknown_email' } });
      throw new AuthenticationError(MESSAGES.INVALID_CREDENTIALS);
    }

    const actor = { ...ctx, id: user.id };
    if (user.locked_until && user.locked_until > new Date()) {
      await auditService.log('login_locked', actor, { metadata: { email, locked_until: user.locked_until.toISOString() } });
      throw new TooManyRequestsError(MESSAGES.ACCOUNT_LOCKED);
    }

    const passwordOk = await verifyPassword(password, user.password_hash);
    if (!passwordOk) {
      const attempts = await userRepository.recordFailedLogin(user.id);
      if (attempts >= AUTH.MAX_LOGIN_ATTEMPTS) {
        const until = new Date(Date.now() + AUTH.LOCK_MINUTES * 60_000);
        await userRepository.lock(user.id, until);
        await auditService.log('login_locked', actor, { metadata: { email, attempts, locked_until: until.toISOString() } });
      } else {
        await auditService.log('login_failed', actor, { metadata: { email, reason: 'bad_password', attempts } });
      }
      throw new AuthenticationError(MESSAGES.INVALID_CREDENTIALS);
    }

    if (!user.is_active) {
      await auditService.log('login_failed', actor, { metadata: { email, reason: 'inactive' } });
      throw new AuthenticationError(MESSAGES.INVALID_CREDENTIALS);
    }

    await userRepository.recordSuccessfulLogin(user.id);
    const refresh = newRefreshToken();
    await refreshTokenRepository.create({
      user_id: user.id,
      token_hash: refresh.token_hash,
      expires_at: refresh.expires_at,
      user_agent: ctx.userAgent?.slice(0, 300) ?? null,
      ip: ctx.ip ?? null,
    });
    await auditService.log('login_success', actor);

    return {
      access_token: signAccessToken({ sub: user.id, role: user.role }),
      user: toPublic({ ...user, last_login_at: new Date() }),
      refresh: { token: refresh.token, expires_at: refresh.expires_at },
    };
  },

  /** Rotates the refresh token. Reusing an already-rotated token revokes every session of that user. */
  async refresh(rawToken: string | undefined, ctx: ClientContext): Promise<Session> {
    if (!rawToken) throw new AuthenticationError(MESSAGES.REFRESH_INVALID);
    const stored = await refreshTokenRepository.findByHash(hashRefreshToken(rawToken));
    if (!stored) throw new AuthenticationError(MESSAGES.REFRESH_INVALID);

    if (stored.revoked_at) {
      if (stored.replaced_by) {
        await refreshTokenRepository.revokeAllForUser(stored.user_id);
        await auditService.log('refresh_reuse_detected', { ...ctx, id: stored.user_id }, { metadata: { token_id: stored.id } });
      }
      throw new AuthenticationError(MESSAGES.REFRESH_INVALID);
    }
    if (stored.expires_at <= new Date() || !stored.user.is_active) {
      throw new AuthenticationError(MESSAGES.REFRESH_INVALID);
    }

    const next = newRefreshToken();
    await withTransaction(async (tx) => {
      const created = await refreshTokenRepository.create(
        {
          user_id: stored.user_id,
          token_hash: next.token_hash,
          expires_at: next.expires_at,
          user_agent: ctx.userAgent?.slice(0, 300) ?? null,
          ip: ctx.ip ?? null,
        },
        tx,
      );
      const rotated = await refreshTokenRepository.markRotated(stored.id, created.id, tx);
      // Lost a race with a concurrent refresh: roll back and make the client sign in again.
      if (!rotated) throw new AuthenticationError(MESSAGES.REFRESH_INVALID);
    });

    return {
      access_token: signAccessToken({ sub: stored.user.id, role: stored.user.role }),
      user: toPublic(stored.user),
      refresh: { token: next.token, expires_at: next.expires_at },
    };
  },

  async logout(rawToken: string | undefined, ctx: ClientContext): Promise<void> {
    if (!rawToken) return;
    const stored = await refreshTokenRepository.findByHash(hashRefreshToken(rawToken));
    if (!stored) return;
    await refreshTokenRepository.revoke(stored.id);
    await auditService.log('logout', { ...ctx, id: stored.user_id });
  },

  async me(userId: string): Promise<PublicUser> {
    const user = await userRepository.findPublicById(userId);
    if (!user) throw new AuthenticationError(MESSAGES.TOKEN_INVALID);
    return user;
  },
};
