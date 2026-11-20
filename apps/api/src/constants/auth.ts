export const AUTH = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCK_MINUTES: 15,
  REFRESH_COOKIE: 'tanaw_refresh',
  /** The refresh cookie is only ever sent to the auth routes. */
  REFRESH_COOKIE_PATH: '/api/auth',
  /** Login attempts per IP per window (on top of the per-account lockout). */
  LOGIN_RATE_LIMIT: 20,
  LOGIN_RATE_WINDOW_MS: 15 * 60 * 1000,
} as const;

export const MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  WRONG_CURRENT_PASSWORD: 'Current password is incorrect',
  ACCOUNT_LOCKED: 'Too many failed logins. Try again later.',
  TOKEN_REQUIRED: 'Authentication required',
  TOKEN_INVALID: 'Invalid or expired access token',
  REFRESH_INVALID: 'Session expired. Please sign in again.',
  USER_NOT_FOUND: 'User not found',
  EMAIL_TAKEN: 'A user with this email already exists',
  CANNOT_CHANGE_SELF: 'You cannot change your own role, deactivate or delete yourself',
  LAST_ADMIN: 'At least one active admin must remain',
} as const;
