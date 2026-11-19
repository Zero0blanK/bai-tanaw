import type { Role } from '@tanaw/shared';

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware from the access token and a fresh user lookup. */
      user?: { id: string; email: string; name: string; role: Role };
    }
  }
}

export {};
