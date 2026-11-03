/**
 * Lets the backend rate-limit per VISITOR instead of per Next.js server.
 *
 * Every backend call from this app (the `/api/*` rewrite and server-side
 * fetches) leaves from this one server, so the backend would otherwise put
 * every visitor in the same rate-limit bucket. We forward the visitor's IP in
 * `x-client-ip`, authenticated with the server-only PROXY_SECRET that the
 * backend shares (see backend common/guards/proxy-aware-throttler.guard.ts).
 * PROXY_SECRET must never be NEXT_PUBLIC_: knowing it lets a caller choose its
 * own bucket.
 */
export const PROXY_SECRET_HEADER = "x-proxy-secret";
export const CLIENT_IP_HEADER = "x-client-ip";

/**
 * The visitor's IP as reported by our hosting edge. Render sits behind
 * Cloudflare, whose `cf-connecting-ip` / `true-client-ip` are set by the edge
 * and cannot be supplied by the client. `x-forwarded-for` is the fallback; its
 * LAST entry is the one our own edge appended (earlier entries are whatever
 * the client claimed).
 */
export function clientIpFrom(h: Headers): string | undefined {
  const edge = h.get("cf-connecting-ip") ?? h.get("true-client-ip");
  if (edge?.trim()) return edge.trim();
  const xff = h
    .get("x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return xff?.length ? xff[xff.length - 1] : undefined;
}

/** Headers to add to a server-side fetch to the backend for the current request. */
export async function backendForwardHeaders(): Promise<Record<string, string>> {
  const secret = process.env.PROXY_SECRET;
  if (!secret) return {};
  let ip: string | undefined;
  try {
    // Imported lazily: this module is reachable from client components (via
    // lib/api/*), and a static next/headers import fails the client build.
    const { headers } = await import("next/headers");
    ip = clientIpFrom(await headers());
  } catch {
    // Outside a request (build-time prerender): nothing to forward.
  }
  return ip ? { [PROXY_SECRET_HEADER]: secret, [CLIENT_IP_HEADER]: ip } : {};
}
