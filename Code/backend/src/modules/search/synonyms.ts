/**
 * Small in-code synonym map (script 08, Task 2). Applied at query-build time so
 * a search for "tee" also matches products titled/tagged "t-shirt", etc. Keys and
 * values are single lowercase alphanumeric tokens (a hyphenated word like
 * "t-shirt" tokenizes to `t` + `shirt`, so we map to the `shirt` lexeme).
 *
 * This is deliberately tiny and hand-curated — a real deployment would source
 * synonyms from the search engine's own thesaurus, which the swappable provider
 * interface leaves room for.
 */
export const SYNONYMS: Record<string, string[]> = {
  tee: ['shirt', 'tshirt'],
  tees: ['shirt', 'tshirt'],
  tshirt: ['shirt', 'tee'],
  hoodie: ['sweatshirt', 'hoody'],
  hoody: ['sweatshirt', 'hoodie'],
  sneaker: ['shoe', 'trainer'],
  sneakers: ['shoe', 'trainer'],
  trainers: ['shoe', 'sneaker'],
  laptop: ['notebook'],
  phone: ['smartphone', 'mobile'],
  tv: ['television'],
  jumper: ['sweater', 'pullover'],
  pants: ['trousers'],
  trousers: ['pants'],
};

/**
 * Build a `to_tsquery`-compatible query string from raw user input, expanding
 * synonyms and using prefix (`:*`) matching so partial words still hit. Returns
 * `null` when the input has no usable alphanumeric tokens (caller then falls back
 * to trigram-only fuzzy matching or plain browsing).
 *
 * Only `[a-z0-9]` tokens ever reach the string, so it can never contain
 * tsquery operator characters — it is safe to pass to `to_tsquery`.
 */
export function buildTsQuery(raw: string | undefined): string | null {
  if (!raw) return null;
  const tokens = raw.toLowerCase().match(/[a-z0-9]+/g);
  if (!tokens || tokens.length === 0) return null;

  const groups = tokens.map((tok) => {
    const expanded = [tok, ...(SYNONYMS[tok] ?? [])];
    // De-dupe while preserving order.
    const seen = new Set<string>();
    const alternatives = expanded.filter((w) => {
      if (seen.has(w)) return false;
      seen.add(w);
      return true;
    });
    return `(${alternatives.map((w) => `${w}:*`).join(' | ')})`;
  });

  return groups.join(' & ');
}
