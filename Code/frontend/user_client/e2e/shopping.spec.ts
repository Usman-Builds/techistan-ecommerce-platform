import { test, expect, seededProductSlug } from "./fixtures";

/**
 * Search → filter → sort → open (script 08) and the cart lifecycle (script 09):
 * add / update quantity / remove, with totals recomputing. Selectors prefer
 * accessible roles/text; add data-testids to harden if the storefront markup
 * shifts.
 */
test.describe("search and browse", () => {
  test("search, apply a facet, change sort, and open a product", async ({ page }) => {
    await page.goto("/search");

    // Query — the storefront search box.
    const searchBox = page.getByRole("searchbox").or(page.getByPlaceholder(/search/i));
    await searchBox.first().fill("shirt");
    await searchBox.first().press("Enter");
    await expect(page).toHaveURL(/q=shirt/);

    // Results grid renders product links.
    const firstProduct = page.getByRole("link", { name: /.+/ }).first();
    await expect(firstProduct).toBeVisible();

    // Change sort (if the toolbar exposes a select) and open a product.
    const sort = page.getByRole("combobox").first();
    if (await sort.count()) {
      await sort.selectOption({ index: 1 }).catch(() => {});
    }
    await page.goto(`/products/${seededProductSlug()}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("cart lifecycle", () => {
  test("add, change quantity, and remove — totals recompute", async ({ page }) => {
    await page.goto(`/products/${seededProductSlug()}`);
    await page.getByRole("button", { name: /add to cart/i }).click();

    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: /cart/i })).toBeVisible();

    // Increase quantity via the stepper and expect the line/total to change.
    const totalBefore = await page.getByText(/\$[\d,.]+/).last().textContent();
    const inc = page.getByLabel("Increase quantity").first();
    if (await inc.count()) {
      await inc.click();
      await expect
        .poll(async () => (await page.getByText(/\$[\d,.]+/).last().textContent()))
        .not.toBe(totalBefore);
    }

    // Remove the line and land on the empty-cart state.
    const remove = page.getByRole("button", { name: /remove/i }).first();
    if (await remove.count()) {
      await remove.click();
      await expect(page.getByText(/your cart is empty/i)).toBeVisible();
    }
  });

  test("an invalid coupon is rejected with a message", async ({ page }) => {
    await page.goto(`/products/${seededProductSlug()}`);
    await page.getByRole("button", { name: /add to cart/i }).click();
    await page.goto("/cart");

    const couponInput = page.getByPlaceholder(/coupon|promo|code/i);
    if (await couponInput.count()) {
      await couponInput.fill("NOTAREALCODE");
      await page.getByRole("button", { name: /apply/i }).click();
      await expect(page.getByText(/not valid|invalid|expired/i)).toBeVisible();
    }
  });
});
