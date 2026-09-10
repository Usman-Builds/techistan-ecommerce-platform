import { describe, it, expect } from "vitest";
import { slugify } from "./slug";

/** Client-side slug preview (mirrors the backend slugify). */
describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });
  it("strips diacritics", () => {
    expect(slugify("Café Crème")).toBe("cafe-creme");
  });
  it("collapses repeated separators and trims edge dashes", () => {
    expect(slugify("  --Foo   &   Bar!!  ")).toBe("foo-bar");
  });
  it("drops non-alphanumerics", () => {
    expect(slugify("Nike Air Max 90 (2024)")).toBe("nike-air-max-90-2024");
  });
  it("caps length at 200 characters", () => {
    expect(slugify("a".repeat(300)).length).toBe(200);
  });
});
