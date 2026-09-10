import { describe, it, expect } from "vitest";
import {
  couponFormSchema,
  automaticDiscountFormSchema,
} from "./promotions";

/** Promotions editor schemas (mirror the backend DTOs; server is source of truth). */
describe("couponFormSchema", () => {
  const base = { code: "SAVE10", type: "PERCENT" as const, active: true };

  it("accepts a valid coupon code", () => {
    expect(couponFormSchema.safeParse(base).success).toBe(true);
  });
  it("rejects a too-short code", () => {
    expect(couponFormSchema.safeParse({ ...base, code: "A" }).success).toBe(false);
  });
  it("rejects a code with illegal characters", () => {
    expect(couponFormSchema.safeParse({ ...base, code: "SAVE 10!" }).success).toBe(false);
  });
  it("rejects an unknown coupon type", () => {
    expect(couponFormSchema.safeParse({ ...base, type: "BOGO" }).success).toBe(false);
  });
});

describe("automaticDiscountFormSchema", () => {
  it("requires an effect value unless the effect is free shipping", () => {
    const noValue = {
      name: "Spring Sale",
      effectType: "PERCENT" as const,
      status: "ACTIVE" as const,
    };
    const parsed = automaticDiscountFormSchema.safeParse(noValue);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes("effectValue"))).toBe(true);
    }
  });

  it("accepts free shipping with no effect value", () => {
    expect(
      automaticDiscountFormSchema.safeParse({
        name: "Free ship",
        effectType: "FREE_SHIPPING",
        status: "ACTIVE",
      }).success,
    ).toBe(true);
  });

  it("accepts a percent discount with a value", () => {
    expect(
      automaticDiscountFormSchema.safeParse({
        name: "10 off",
        effectType: "PERCENT",
        effectValue: "10",
        status: "SCHEDULED",
      }).success,
    ).toBe(true);
  });
});
