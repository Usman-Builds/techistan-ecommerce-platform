// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

/**
 * #41: an expired access cookie with a still-valid refresh cookie must not
 * bounce the customer to /login. The proxy refreshes the session first (like
 * the browser client does on a 401), forwards the rotated cookies to the
 * browser, and passes them on to the account layout's server-side check.
 */
const ROTATED = [
  "access_token=new-access; Path=/; HttpOnly; SameSite=Lax",
  "refresh_token=new-refresh; Path=/; HttpOnly; SameSite=Lax",
];

function req(path: string, cookie?: string) {
  return new NextRequest(`http://shop.test${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

function mockRefresh(status: number, setCookies: string[] = []) {
  const headers = new Headers();
  for (const c of setCookies) headers.append("set-cookie", c);
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response("{}", { status, headers })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("proxy session gate", () => {
  it("redirects to /login when there are no auth cookies", async () => {
    const fetchMock = mockRefresh(200, ROTATED);
    const res = await proxy(req("/account/orders"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://shop.test/login?next=%2Faccount%2Forders",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a request with an access cookie through without refreshing", async () => {
    const fetchMock = mockRefresh(200, ROTATED);
    const res = await proxy(req("/account", "access_token=a; refresh_token=r"));
    expect(res.headers.get("location")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes when only the refresh cookie is left", async () => {
    const fetchMock = mockRefresh(200, ROTATED);
    const res = await proxy(
      req("/account/orders", "refresh_token=old; theme=dark"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/auth\/refresh$/);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).cookie).toContain(
      "refresh_token=old",
    );

    // Not redirected; rotated cookies go back to the browser...
    expect(res.headers.get("location")).toBeNull();
    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).toContain("access_token=new-access");
    expect(setCookie).toContain("refresh_token=new-refresh");
    // ...and on to the page render via the overridden request Cookie header.
    const forwarded = res.headers.get("x-middleware-request-cookie") ?? "";
    expect(forwarded).toContain("access_token=new-access");
    expect(forwarded).toContain("refresh_token=new-refresh");
    expect(forwarded).toContain("theme=dark");
  });

  it("redirects to /login when the refresh is refused", async () => {
    mockRefresh(401);
    const res = await proxy(req("/wishlist", "refresh_token=revoked"));
    expect(res.headers.get("location")).toBe(
      "http://shop.test/login?next=%2Fwishlist",
    );
  });

  it("redirects to /login when the backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))),
    );
    const res = await proxy(req("/account", "refresh_token=r"));
    expect(res.headers.get("location")).toContain("/login");
  });
});
