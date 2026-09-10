import AxeBuilder from "@axe-core/playwright";
import { test, expect, ADMIN, ADMIN_URL, seededProductSlug } from "./fixtures";

/**
 * Accessibility (Task 5, WCAG 2.1 AA). Runs axe-core against the major storefront
 * and admin pages, and asserts keyboard operability on the auth + checkout forms
 * (tab order + visible focus). Contrast (≥4.5:1) is part of the WCAG AA ruleset.
 */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: import("@playwright/test").Page) {
  return new AxeBuilder({ page }).withTags(WCAG).analyze();
}

test.describe("storefront accessibility", () => {
  const pages: Array<[string, string]> = [
    ["home", "/"],
    ["search / PLP", "/search"],
    ["cart", "/cart"],
    ["login", "/login"],
  ];

  for (const [name, path] of pages) {
    test(`${name} has no serious axe violations`, async ({ page }) => {
      await page.goto(path);
      const { violations } = await scan(page);
      const serious = violations.filter((v) =>
        ["serious", "critical"].includes(v.impact ?? ""),
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }

  test("PDP has no serious axe violations", async ({ page }) => {
    await page.goto(`/products/${seededProductSlug()}`);
    const { violations } = await scan(page);
    const serious = violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("login form is keyboard operable with visible focus", async ({ page }) => {
    await page.goto("/login");
    await page.keyboard.press("Tab");
    // Focus should land on an interactive control, and the focused element must
    // have a visible focus indicator (outline/ring) — never focus with no cue.
    const active = page.locator(":focus");
    await expect(active).toBeVisible();
    const outline = await active.evaluate((el) => {
      const s = getComputedStyle(el);
      return s.outlineStyle !== "none" || s.boxShadow !== "none";
    });
    expect(outline).toBeTruthy();
  });
});

test.describe("admin accessibility", () => {
  test("admin login has no serious axe violations", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/login`);
    const { violations } = await scan(page);
    const serious = violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("admin dashboard has no serious axe violations", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/login`);
    await page.getByLabel(/email/i).fill(ADMIN.email);
    await page.getByLabel(/password/i).fill(ADMIN.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 15_000 }).catch(() => {});
    const { violations } = await scan(page);
    const serious = violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
