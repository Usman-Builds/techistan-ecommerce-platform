/**
 * Slug helpers shared by the catalog domain (products & categories, script 07).
 *
 * `slugify` is pure; `ensureUniqueSlug` takes an async existence predicate so the
 * caller supplies the DB lookup (and can scope it, e.g. exclude the row being
 * updated). Uniqueness is resolved by appending `-2`, `-3`, … on collision.
 */

/** Turn arbitrary text into a URL-safe slug (diacritics stripped, ≤200 chars). */
export function slugify(input: string): string {
  const base = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumerics → hyphen
    .replace(/-{2,}/g, '-') // collapse runs
    .replace(/^-+|-+$/g, '') // trim hyphens
    .slice(0, 200);
  return base || 'item';
}

/**
 * Resolve a unique slug from `base`. `exists(slug)` must resolve `true` when the
 * slug is already taken (the caller decides how to scope that check).
 */
export async function ensureUniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let n = 2;
  // Bounded to avoid a pathological loop; practically never iterates far.
  while (n < 10_000 && (await exists(candidate))) {
    candidate = `${root}-${n}`;
    n += 1;
  }
  return candidate;
}
