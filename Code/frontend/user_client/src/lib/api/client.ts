/**
 * Typed fetch wrapper around the Techistan NestJS backend.
 * Sends the JWT httpOnly cookie on every request (`credentials: "include"`).
 *
 * Routing: the BROWSER never calls the backend host directly. It calls the
 * same-origin `/api/*` prefix, which next.config.ts rewrites to the backend.
 * That keeps the auth cookies first-party on this app's own host, so they
 * survive `SameSite=Lax` when the API lives on another site (e.g. two separate
 * *.onrender.com hosts), and proxy.ts / server components can read them.
 * Server-side code has no browser cookie jar and calls BACKEND_URL directly.
 *
 * Session continuity (script 04, Task 15): on a 401 the client makes a single
 * silent `POST /auth/refresh` and retries the original request once. If the
 * refresh fails, the 401 propagates so the auth layer can clear state and
 * redirect to /login.
 */

/** The NestJS backend. Use it only from server-side code. */
export const BACKEND_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

/** Same-origin prefix for browser requests and links, proxied to BACKEND_URL. */
export const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

// Endpoints that must never trigger the silent-refresh retry (avoids loops).
const NO_REFRESH_RETRY = new Set([
  "/auth/refresh",
  "/auth/login",
  "/auth/register",
  "/auth/logout",
]);

async function doFetch(path: string, options: RequestOptions): Promise<Response> {
  const { body, headers, ...rest } = options;
  const base = typeof window === "undefined" ? BACKEND_URL : API_BASE;
  return fetch(`${base}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function parse<T>(res: Response, isJson: boolean): Promise<T> {
  const payload = isJson
    ? await res.json().catch(() => null)
    : await res.text();

  if (!res.ok) {
    const message =
      (isJson && payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : res.statusText) || "Request failed";
    throw new ApiError(res.status, message, payload);
  }
  return payload as T;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let res = await doFetch(path, options);

  // Silent single refresh-and-retry on 401 for eligible endpoints.
  if (res.status === 401 && !NO_REFRESH_RETRY.has(path)) {
    const refreshed = await doFetch("/auth/refresh", { method: "POST" });
    if (refreshed.ok) {
      res = await doFetch(path, options);
    }
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  return parse<T>(res, Boolean(isJson));
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),
};
