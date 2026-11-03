import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  clientIpFrom,
} from "@/lib/server/backend-headers";
import { BACKEND_URL } from "@/lib/api/client";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  refreshSession,
} from "@/lib/server/session-refresh";

/**
 * `/api/*` is rewritten to the backend in next.config.ts. Tag those requests
 * with the visitor's IP (authenticated by PROXY_SECRET) so the backend
 * rate-limits per visitor rather than per this server; see
 * lib/server/backend-headers.ts. Client-supplied copies of these headers are
 * always dropped so they can never be smuggled through.
 */
function tagBackendRequest(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(PROXY_SECRET_HEADER);
  headers.delete(CLIENT_IP_HEADER);
  const secret = process.env.PROXY_SECRET;
  const ip = clientIpFrom(request.headers);
  if (secret && ip) {
    headers.set(PROXY_SECRET_HEADER, secret);
    headers.set(CLIENT_IP_HEADER, ip);
  }
  return NextResponse.next({ request: { headers } });
}

/**
 * Next.js 16 renamed `middleware` → `proxy`. This runs before protected routes
 * and does a cheap FIRST-LINE check: is the access-token cookie present? If not,
 * bounce to /login with a `next` param so we can return the user afterwards.
 *
 * When only the refresh cookie is left, the session is refreshed here first
 * (see below).
 *
 * This is NOT authorization — the cookie's contents are never trusted here
 * (NFR-208). The authoritative identity/role check happens server-side in the
 * account layout via GET /auth/me, and the backend guards are the real source
 * of truth.
 */
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return tagBackendRequest(request);
  }

  const toLogin = () => {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  };

  if (request.cookies.has(ACCESS_COOKIE)) return NextResponse.next();
  if (!request.cookies.has(REFRESH_COOKIE)) return toLogin();

  // The access cookie has expired (it lives as long as the token) but the
  // 30-day refresh cookie is still here. Rotate the session now, before the
  // account layout's server-side GET /auth/me runs, instead of bouncing a
  // returning customer to /login every day (#41). The new cookies go to the
  // browser and into this request so the layout sees them immediately.
  const refreshed = await refreshSession(BACKEND_URL, request.headers);
  if (!refreshed) return toLogin();

  const headers = new Headers(request.headers);
  headers.set("cookie", refreshed.cookieHeader);
  const response = NextResponse.next({ request: { headers } });
  for (const c of refreshed.setCookies) {
    response.headers.append("set-cookie", c);
  }
  return response;
}

export const config = {
  // Gate customer-only areas. (The cart is guest-friendly and stays ungated.)
  matcher: ["/account/:path*", "/wishlist/:path*", "/api/:path*"],
};
