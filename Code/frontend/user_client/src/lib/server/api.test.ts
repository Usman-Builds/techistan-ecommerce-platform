import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #53: the product/category pages call notFound() when the lookup returns null,
 * so the lookup may only return null when the API actually said 404. Any other
 * failure (5xx, 429, network error during a cold start) must throw, letting
 * app/error.tsx render instead of telling shoppers and crawlers the page is gone.
 */
vi.mock("./backend-headers", () => ({
  backendForwardHeaders: vi.fn(async () => ({})),
}));

import { serverGet, serverGetOrNotFound } from "./api";
import { getProductBySlugServer } from "../api/products";
import { getCategoryBySlugServer } from "../api/categories";

const fetchMock = vi.fn();
const respond = (status: number, body: unknown = {}) =>
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("serverGetOrNotFound", () => {
  it("returns the body on 2xx", async () => {
    respond(200, { slug: "mouse" });
    await expect(serverGetOrNotFound("/products/mouse")).resolves.toEqual({
      slug: "mouse",
    });
  });

  it("returns null only on a real 404", async () => {
    respond(404, { message: "Not found" });
    await expect(serverGetOrNotFound("/products/nope")).resolves.toBeNull();
  });

  it.each([500, 502, 503, 429])("throws on HTTP %s", async (status) => {
    respond(status);
    await expect(serverGetOrNotFound("/products/mouse")).rejects.toThrow(
      String(status),
    );
  });

  it("throws on a network error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(serverGetOrNotFound("/products/mouse")).rejects.toThrow();
  });
});

describe("page lookups only report missing on 404", () => {
  it("product lookup throws on 503 instead of returning null", async () => {
    respond(503);
    await expect(getProductBySlugServer("mouse")).rejects.toThrow();
  });

  it("category lookup throws on a network error instead of returning null", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(getCategoryBySlugServer("laptops")).rejects.toThrow();
  });

  it("product lookup still returns null on 404", async () => {
    respond(404);
    await expect(getProductBySlugServer("gone")).resolves.toBeNull();
  });
});

describe("serverGet stays tolerant for optional chrome", () => {
  it("returns null on 500", async () => {
    respond(500);
    await expect(serverGet("/settings")).resolves.toBeNull();
  });
});
