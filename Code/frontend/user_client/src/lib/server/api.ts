import { API_URL } from "@/lib/api/client";

/**
 * Server-side GET for SSR/SEO reads in Server Components (script 14). Hits the
 * public NestJS REST API directly. Deliberately **error-tolerant**: any network
 * failure or non-2xx resolves to `null` so a page (or the global Header/Footer)
 * degrades gracefully instead of throwing — this also keeps `next build` from
 * depending on a running backend when it prerenders static routes.
 *
 * `cache: "no-store"` keeps catalog/settings reads fresh (Next 16 does not cache
 * fetch by default, but we are explicit). Callers that must 404 on a missing
 * resource should check for `null` and call `notFound()`.
 */
export async function serverGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
