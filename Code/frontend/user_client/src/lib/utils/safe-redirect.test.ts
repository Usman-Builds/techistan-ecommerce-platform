import { describe, it, expect } from "vitest";
import { safeNextPath } from "./safe-redirect";

/**
 * `?next=` on /login is attacker-controlled (#40). Only same-origin relative
 * paths may be followed after sign-in; anything that could leave the site
 * falls back to /account.
 */
describe("safeNextPath", () => {
  it.each(["/account", "/wishlist", "/search?q=mouse", "/c/laptops#top", "/account/orders/abc"])(
    "keeps the same-origin path %s",
    (p) => {
      expect(safeNextPath(p)).toBe(p);
    },
  );

  it.each([
    "https://evil.example/login",
    "http://evil.example",
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/%5Cevil.example",
    "/%2F%2Fevil.example",
    "javascript:alert(1)",
    "  //evil.example",
    "/\t/evil.example",
    "evil.example",
    "account",
  ])("rejects %s", (p) => {
    expect(safeNextPath(p)).toBe("/account");
  });

  it("falls back when next is missing or empty", () => {
    expect(safeNextPath(null)).toBe("/account");
    expect(safeNextPath(undefined)).toBe("/account");
    expect(safeNextPath("")).toBe("/account");
  });

  it("uses a custom fallback", () => {
    expect(safeNextPath("//evil.example", "/")).toBe("/");
  });
});
