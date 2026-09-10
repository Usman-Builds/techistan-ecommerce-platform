import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16 renamed `middleware` → `proxy`. This runs before protected routes
 * and does a cheap FIRST-LINE check: is the access-token cookie present? If not,
 * bounce to /login with a `next` param so we can return the user afterwards.
 *
 * This is NOT authorization — the cookie's contents are never trusted here
 * (NFR-208). The authoritative identity/role check happens server-side in the
 * account layout via GET /auth/me, and the backend guards are the real source
 * of truth.
 */
export function proxy(request: NextRequest) {
  const hasToken =
    request.cookies.has("access_token") || request.cookies.has("refresh_token");

  if (!hasToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Gate customer-only areas. (The cart is guest-friendly and stays ungated.)
  matcher: ["/account/:path*", "/wishlist/:path*"],
};
