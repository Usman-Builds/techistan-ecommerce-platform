import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  clientIpFrom,
} from "@/lib/server/backend-headers";

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
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return tagBackendRequest(request);
  }

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
    "/api/:path*",
    "/((?!login|api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|sitemap.xml|robots.txt).*)",
  ],
};
