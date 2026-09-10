/**
 * Client-side slug preview (mirrors the backend `slugify`). Purely cosmetic —
 * the backend re-slugs and enforces uniqueness, so this is just a live hint in
 * the product/category editors.
 */
export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
  return base;
}
