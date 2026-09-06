/** Max products kept in a recently-viewed list (per user and per guest cookie). */
export const RECENTLY_VIEWED_LIMIT = 12;

/** Guest cookie name holding a JSON array of recently-viewed product ids. */
export const RV_COOKIE = 'rv';

/** Guest cookie lifetime (30 days). */
export const RV_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/**
 * Parse the guest recently-viewed cookie into a bounded, de-duplicated id list.
 * Tolerates a missing/garbage cookie by returning an empty list.
 */
export function parseRvCookie(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids = parsed.filter((v): v is string => typeof v === 'string');
    return [...new Set(ids)].slice(0, RECENTLY_VIEWED_LIMIT);
  } catch {
    return [];
  }
}

/** Prepend a freshly-viewed id, de-dupe, and cap the guest list. */
export function pushRvCookie(existing: string[], productId: string): string[] {
  return [productId, ...existing.filter((id) => id !== productId)].slice(
    0,
    RECENTLY_VIEWED_LIMIT,
  );
}
