import {
  CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  clientIpFrom,
} from "@/lib/server/backend-headers";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

export interface RefreshedSession {
  /** Raw `Set-Cookie` values from the backend, to forward to the browser. */
  setCookies: string[];
  /** The request's Cookie header with the rotated tokens swapped in. */
  cookieHeader: string;
}

/** `name=value` pairs from a Cookie header, in order. */
function parseCookieHeader(header: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    out.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return out;
}

/** The `name=value` at the start of a Set-Cookie header. */
function cookiePair(setCookie: string): [string, string] | null {
  const first = setCookie.split(";")[0];
  const i = first.indexOf("=");
  if (i <= 0) return null;
  return [first.slice(0, i).trim(), first.slice(i + 1).trim()];
}

/**
 * Restore a session whose access token has expired but whose refresh token is
 * still valid (#41). Calls the backend `POST /auth/refresh` with the incoming
 * cookies, the same call the browser client makes on a 401. On success returns
 * the rotated cookies for both directions: the browser (Set-Cookie) and the
 * rest of this request (Cookie), so the server-side `GET /auth/me` in the
 * account layout sees the new access token. Returns null when there is nothing
 * to refresh or the backend refuses.
 */
export async function refreshSession(
  backendUrl: string,
  requestHeaders: Headers,
  fetchImpl: typeof fetch = fetch,
): Promise<RefreshedSession | null> {
  const cookieHeader = requestHeaders.get("cookie") ?? "";
  const cookies = parseCookieHeader(cookieHeader);
  if (!cookies.get(REFRESH_COOKIE)) return null;

  const headers: Record<string, string> = { cookie: cookieHeader };
  const secret = process.env.PROXY_SECRET;
  const ip = clientIpFrom(requestHeaders);
  if (secret && ip) {
    headers[PROXY_SECRET_HEADER] = secret;
    headers[CLIENT_IP_HEADER] = ip;
  }

  let res: Response;
  try {
    res = await fetchImpl(`${backendUrl}/auth/refresh`, {
      method: "POST",
      headers,
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const setCookies = res.headers.getSetCookie();
  let gotAccess = false;
  for (const sc of setCookies) {
    const pair = cookiePair(sc);
    if (!pair) continue;
    cookies.set(pair[0], pair[1]);
    if (pair[0] === ACCESS_COOKIE && pair[1]) gotAccess = true;
  }
  if (!gotAccess) return null;

  return {
    setCookies,
    cookieHeader: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
  };
}
