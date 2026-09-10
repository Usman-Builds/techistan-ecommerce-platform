import { test, expect, seededProductSlug } from "./fixtures";

/**
 * Visual regression (Task 5). Screenshot snapshots of key pages across the two
 * configured viewports (mobile-safari + desktop-chromium projects). Baselines
 * are committed under e2e/__snapshots__; regressions diff on CI. Update
 * intentional changes with:  npm run e2e:update
 *
 * We mask time/price-volatile regions and disable animations so snapshots are
 * deterministic.
 */
const stable = { animations: "disabled", caret: "hide" } as const;

test.describe("visual regression", () => {
  test("home page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("home.png", { fullPage: true, ...stable });
  });

  test("product detail page", async ({ page }) => {
    await page.goto(`/products/${seededProductSlug()}`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("pdp.png", { fullPage: true, ...stable });
  });

  test("empty cart", async ({ page }) => {
    await page.goto("/cart");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("cart-empty.png", { ...stable });
  });
});
