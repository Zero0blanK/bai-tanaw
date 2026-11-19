import { LoginBody } from '@tanaw/shared';
import type { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AUTH } from '../constants/auth.js';
import { authService, type Session } from '../services/auth.service.js';
import { ok } from '../utils/apiResponse.js';
import { AuthenticationError } from '../utils/errors.js';
import { clientContext } from '../utils/request.js';

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: AUTH.REFRESH_COOKIE_PATH,
  };
}

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[AUTH.REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

/** Access token in the body (client keeps it in memory); refresh token only in the httpOnly cookie. */
function sendSession(res: Response, session: Session, message?: string) {
  res.cookie(AUTH.REFRESH_COOKIE, session.refresh.token, { ...cookieOptions(), expires: session.refresh.expires_at });
  return ok(res, { access_token: session.access_token, user: session.user }, message);
}

export const authController = {
  async login(req: Request, res: Response) {
    const { email, password } = LoginBody.parse(req.body);
    const session = await authService.login(email, password, clientContext(req));
    sendSession(res, session, 'Signed in');
  },

  async refresh(req: Request, res: Response) {
    try {
      const session = await authService.refresh(readRefreshCookie(req), clientContext(req));
      sendSession(res, session);
    } catch (error) {
      if (error instanceof AuthenticationError) res.clearCookie(AUTH.REFRESH_COOKIE, cookieOptions());
      throw error;
    }
  },

  async logout(req: Request, res: Response) {
    await authService.logout(readRefreshCookie(req), clientContext(req));
    res.clearCookie(AUTH.REFRESH_COOKIE, cookieOptions());
    ok(res, null, 'Signed out');
  },

  async me(req: Request, res: Response) {
    if (!req.user) throw new AuthenticationError();
    ok(res, await authService.me(req.user.id));
  },
};
