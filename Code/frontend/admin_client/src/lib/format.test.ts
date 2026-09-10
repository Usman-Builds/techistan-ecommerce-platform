import { describe, it, expect } from "vitest";
import {
  formatCents,
  formatPriceRange,
  dollarsToCents,
  centsToDollars,
} from "./format";

/** Admin money helpers — backend stores integer cents; the UI edits dollars. */
describe("formatCents", () => {
  it("formats cents as currency", () => {
    expect(formatCents(1999)).toBe("$19.99");
    expect(formatCents(0)).toBe("$0.00");
  });
  it("renders an em dash for null/undefined", () => {
    expect(formatCents(null)).toBe("—");
    expect(formatCents(undefined)).toBe("—");
  });
  it("respects the currency argument", () => {
    expect(formatCents(1000, "EUR")).toBe("€10.00");
  });
});

describe("formatPriceRange", () => {
  it("collapses an equal or single-sided range", () => {
    expect(formatPriceRange(1999, 1999)).toBe("$19.99");
    expect(formatPriceRange(1999, null)).toBe("$19.99");
  });
  it("shows both bounds when they differ", () => {
    expect(formatPriceRange(1000, 2000)).toBe("$10.00 – $20.00");
  });
  it("renders an em dash when min is null", () => {
    expect(formatPriceRange(null, 2000)).toBe("—");
  });
});

describe("dollarsToCents", () => {
  it("parses a dollars string into integer cents", () => {
    expect(dollarsToCents("19.99")).toBe(1999);
    expect(dollarsToCents(" 5 ")).toBe(500);
  });
  it("returns null for blank input", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("   ")).toBeNull();
  });
  it("returns NaN for invalid or negative input", () => {
    expect(dollarsToCents("abc")).toBeNaN();
    expect(dollarsToCents("-3")).toBeNaN();
  });
  it("rounds to the nearest cent", () => {
    expect(dollarsToCents("19.999")).toBe(2000);
  });
});

describe("centsToDollars", () => {
  it("renders a fixed 2-dp dollars string", () => {
    expect(centsToDollars(1999)).toBe("19.99");
    expect(centsToDollars(500)).toBe("5.00");
  });
  it("returns an empty string for null/undefined", () => {
    expect(centsToDollars(null)).toBe("");
    expect(centsToDollars(undefined)).toBe("");
  });
});
