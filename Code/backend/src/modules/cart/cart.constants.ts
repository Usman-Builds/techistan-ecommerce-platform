/**
 * Cart constants (script 09). The guest cart is tracked by a SIGNED httpOnly
 * cookie so a forged/tampered sessionId is rejected by cookie-parser (lands in
 * req.signedCookies as `false`). The auth flow reads this same cookie name to
 * merge a guest cart into the customer cart on login (FR-301).
 */

/** Signed httpOnly cookie carrying the guest cart's opaque sessionId. */
export const CART_SESSION_COOKIE = 'cartSessionId';

/** Guest cart cookie lifetime (30 days). */
export const CART_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/** Abandoned-cart thresholds (FR-306). Job wiring lands in script 16. */
export const ABANDONED_FIRST_MS = 60 * 60 * 1000; // 1 hour
export const ABANDONED_FINAL_MS = 24 * 60 * 60 * 1000; // 24 hours
