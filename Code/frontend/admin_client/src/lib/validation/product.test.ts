import { describe, it, expect } from "vitest";
import { productFormSchema } from "./product";

describe("productFormSchema", () => {
  const base = { title: "Nike Air", status: "DRAFT" as const };

  it("accepts a minimal valid product", () => {
    expect(productFormSchema.safeParse(base).success).toBe(true);
  });
  it("requires a title", () => {
    expect(productFormSchema.safeParse({ ...base, title: "" }).success).toBe(false);
  });
  it("rejects a non-slug slug", () => {
    expect(productFormSchema.safeParse({ ...base, slug: "Not A Slug" }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...base, slug: "nike-air-90" }).success).toBe(true);
  });
  it("rejects an unknown status", () => {
    expect(productFormSchema.safeParse({ ...base, status: "LIVE" }).success).toBe(false);
  });
  it("requires an absolute canonical URL when provided", () => {
    expect(productFormSchema.safeParse({ ...base, canonicalUrl: "/relative" }).success).toBe(false);
    expect(
      productFormSchema.safeParse({ ...base, canonicalUrl: "https://x.com/p" }).success,
    ).toBe(true);
  });
});
