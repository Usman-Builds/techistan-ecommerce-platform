import { describe, expect, it } from "vitest";
import { parseShippingZones, SHIPPING_ZONES_PLACEHOLDER } from "./shipping-zones";

/**
 * #34: the settings form must send shipping zones as the array the pricing
 * engine reads. It used to reject arrays outright and suggest an object shape
 * that pricing silently ignored.
 */
describe("parseShippingZones", () => {
  it("accepts an array of zones", () => {
    expect(
      parseShippingZones('[{"label":"US","countries":["US"],"rateCents":900}]'),
    ).toEqual([{ label: "US", countries: ["US"], rateCents: 900 }]);
  });

  it("treats empty text as null (built-in default)", () => {
    expect(parseShippingZones("   ")).toBeNull();
  });

  it("rejects the old object shape with a helpful message", () => {
    expect(() =>
      parseShippingZones('{ "DEFAULT": { "flat": 500, "freeOver": 5000 } }'),
    ).toThrow(/must be a JSON array/);
  });

  it("rejects a zone missing rateCents", () => {
    expect(() => parseShippingZones('[{"label":"US"}]')).toThrow(/zone 1/);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseShippingZones("[{")).toThrow(/not valid JSON/);
  });

  it("the placeholder itself is a valid example", () => {
    expect(parseShippingZones(SHIPPING_ZONES_PLACEHOLDER)).toHaveLength(2);
  });
});
