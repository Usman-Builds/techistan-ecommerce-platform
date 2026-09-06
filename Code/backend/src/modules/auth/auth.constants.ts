/**
 * Shared auth constants — single source of truth so other modules (e.g. script
 * 05's `seedAdmin()`) reuse the same bcrypt cost and cookie contract.
 */

// NFR-204: bcrypt work factor for every password hash (register + reset + seed).
export const BCRYPT_COST = 12;

// httpOnly cookie names carrying the JWTs (see jwt.strategy cookie extractor).
export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

// Token lifetimes for the email-verification / password-reset flows.
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h (FR-101)
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h  (FR-103)

// Strong-password policy (FR-105): min 8, ≥1 upper, ≥1 number, ≥1 symbol.
export const PASSWORD_REGEX =
  /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const PASSWORD_MESSAGE =
  'Password must be at least 8 characters and include an uppercase letter, a number, and a symbol';
