import { BACKEND_URL } from "@/lib/api/client";
import { backendForwardHeaders } from "@/lib/server/backend-headers";

/**
 * Server-side GET for SSR/SEO reads in Server Components (script 14). Hits the
 * public NestJS REST API directly. Deliberately **error-tolerant**: any network
 * failure or non-2xx resolves to `null` so a page (or the global Header/Footer)
 * degrades gracefully instead of throwing — this also keeps `next build` from
 * depending on a running backend when it prerenders static routes.
 *
 * `cache: "no-store"` keeps catalog/settings reads fresh (Next 16 does not cache
 * fetch by default, but we are explicit). Callers that must 404 on a missing
 * resource should use {@link serverGetOrNotFound}, which only returns `null` on
 * a real 404.
 */
export async function serverGet<T>(path: string): Promise<T | null> {
  const headers = await backendForwardHeaders();
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Like {@link serverGet}, but for lookups whose `null` means "doesn't exist" and
 * leads to `notFound()` (product / category pages). Returns `null` **only** on a
 * real 404; every other failure (5xx, 429, network error, cold start) throws so
 * `app/error.tsx` renders instead of a 404 that tells shoppers and crawlers the
 * page is gone (#53).
 */
export async function serverGetOrNotFound<T>(path: string): Promise<T | null> {
  const headers = await backendForwardHeaders();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers,
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Backend GET ${path} failed with HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
