import { describe, it, expect } from "vitest";
import { formatMoney } from "./money";

/**
 * Storefront money formatting (mirrors the backend `formatMoney`). Money is
 * integer cents on the wire; this is the single cents→display boundary.
 */
describe("formatMoney", () => {
  it("formats USD cents with a symbol and two decimals", () => {
    expect(formatMoney(1999, "USD")).toBe("$19.99");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(100000, "USD")).toBe("$1,000.00");
  });

  it("upper-cases the currency code", () => {
    expect(formatMoney(500, "usd")).toBe("$5.00");
  });

  it("defaults an empty currency to USD", () => {
    expect(formatMoney(500, "")).toBe("$5.00");
  });

  it("honors zero-decimal currencies (JPY)", () => {
    expect(formatMoney(1000, "JPY")).toBe("¥1,000");
  });

  it("sums integer cents without float drift", () => {
    const total = [1999, 1999, 100].reduce((a, b) => a + b, 0); // 4098
    expect(formatMoney(total)).toBe("$40.98");
  });

  it("falls back gracefully for an invalid currency code", () => {
    expect(formatMoney(1999, "ZZ")).toBe("19.99 ZZ");
  });
});
