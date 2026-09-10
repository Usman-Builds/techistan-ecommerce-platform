import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16 renamed `middleware` → `proxy`. This is the FIRST-LINE gate for the
 * admin app: every route except /login (and Next internals) requires an
 * auth-cookie to be present. Missing cookie → bounce to /login.
 *
 * This is NOT authorization — the cookie's contents are never trusted here
 * (NFR-208). The authoritative identity/role check happens server-side in the
 * (admin) shell layout via GET /auth/me (which rejects non-admin roles), and the
 * backend guards are the real source of truth.
 */
export function proxy(request: NextRequest) {
  const hasToken =
    request.cookies.has("access_token") || request.cookies.has("refresh_token");

  if (!hasToken) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match everything except /login, Next internals, and static/metadata files.
  matcher: [
    "/((?!login|api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
