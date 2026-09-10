/**
 * The storefront's own public origin (script 17). Drives `metadataBase`,
 * canonical links, the sitemap/robots absolute URLs, and JSON-LD `url`/`@id`
 * fields. Server- and client-safe (plain env read, no DOM/Next imports).
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

/** Resolve a path (or pass-through absolute URL) to an absolute site URL. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
