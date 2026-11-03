import { afterEach, describe, expect, it } from "vitest";
import {
  centsToDollars,
  dollarsToCents,
  formatCents,
  formatPriceRange,
  minorUnitDigits,
  setStoreCurrency,
} from "./format";

/**
 * #49: money is stored in the currency's real minor units (USD 2, JPY 0,
 * BHD 3), like the backend, storefront and Stripe. The admin helpers must
 * agree, or a ¥1,000 price is saved as 100000 and charged as ¥100,000.
 */
afterEach(() => setStoreCurrency("USD"));

describe("minorUnitDigits", () => {
  it.each([
    ["USD", 2],
    ["EUR", 2],
    ["JPY", 0],
    ["KRW", 0],
    ["BHD", 3],
  ])("%s has %i minor digits", (code, digits) => {
    expect(minorUnitDigits(code)).toBe(digits);
  });
});

describe.each([
  ["USD", "19.99", 1999, "$19.99"],
  ["JPY", "1000", 1000, "¥1,000"],
  ["BHD", "1.250", 1250, "BHD 1.250"],
])("%s round trip", (code, input, minor, display) => {
  it("parses the admin input into minor units", () => {
    expect(dollarsToCents(input, code)).toBe(minor);
  });
  it("renders minor units back into the same input value", () => {
    expect(centsToDollars(minor, code)).toBe(input);
  });
  it("formats minor units for display", () => {
    expect(formatCents(minor, code).replace(/ /g, " ")).toBe(display);
  });
});

describe("store currency default", () => {
  it("uses the store currency when no currency is passed", () => {
    setStoreCurrency("JPY");
    expect(dollarsToCents("1000")).toBe(1000);
    expect(centsToDollars(1000)).toBe("1000");
    expect(formatCents(1000)).toBe("¥1,000");
    expect(formatPriceRange(1000, 2000)).toBe("¥1,000 – ¥2,000");
  });

  it("ignores an invalid store currency", () => {
    setStoreCurrency("nope");
    expect(formatCents(1999)).toBe("$19.99");
  });
});
