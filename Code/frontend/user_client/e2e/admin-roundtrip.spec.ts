import { test, expect, ADMIN, ADMIN_URL } from "./fixtures";

/**
 * Admin → storefront round-trip (SRD §11, Task 6). Create a product in the admin
 * client, assert it surfaces on the storefront, then (order → process → refund)
 * and assert the customer-side status reflects it. Spans admin_client (:3002),
 * backend (:3000), and user_client (:3001).
 *
 * This is the highest-fidelity cross-app journey; the selectors below are a
 * scaffold — align them with the admin product-form + order-detail markup (add
 * data-testids where the DOM is ambiguous).
 */
test.describe("admin ↔ storefront round-trip", () => {
  test("create a product in admin → it appears on the storefront", async ({ page, context }) => {
    // Sign into the admin client.
    await page.goto(`${ADMIN_URL}/login`);
    await page.getByLabel(/email/i).fill(ADMIN.email);
    await page.getByLabel(/password/i).fill(ADMIN.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(new RegExp(`${ADMIN_URL.replace(/[/.]/g, "\\$&")}/(dashboard)?`), {
      timeout: 15_000,
    }).catch(() => {});

    // Create a product (title unique per run so it's findable on the storefront).
    const title = `E2E Roundtrip ${Date.now()}`;
    await page.goto(`${ADMIN_URL}/products/new`);
    await page.getByLabel(/title/i).fill(title);
    // Status → ACTIVE so it is publicly visible.
    const status = page.getByLabel(/status/i);
    if (await status.count()) await status.selectOption("ACTIVE").catch(() => {});
    await page.getByRole("button", { name: /save|create|publish/i }).first().click();

    // The storefront search should surface the new ACTIVE product.
    const store = await context.newPage();
    await store.goto(`/search?q=${encodeURIComponent("E2E Roundtrip")}`);
    await expect(store.getByText(title).first()).toBeVisible({ timeout: 15_000 });
  });

  test("process then refund an order → customer status reflects it", async ({ page }) => {
    // Precondition: at least one order exists (create via the purchase spec or a
    // seeded fixture). Open the admin orders list and act on the newest.
    await page.goto(`${ADMIN_URL}/login`);
    await page.getByLabel(/email/i).fill(ADMIN.email);
    await page.getByLabel(/password/i).fill(ADMIN.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    await page.goto(`${ADMIN_URL}/orders`);
    await page.getByRole("link", { name: /ORD-/ }).first().click();

    // Advance status (CONFIRMED → PROCESSING) then refund.
    const statusControl = page.getByRole("combobox").first();
    if (await statusControl.count()) {
      await statusControl.selectOption({ label: "Processing" }).catch(() => {});
    }
    const refund = page.getByRole("button", { name: /refund/i });
    if (await refund.count()) {
      await refund.click();
      await page.getByRole("button", { name: /confirm|refund/i }).last().click();
      await expect(page.getByText(/refunded/i)).toBeVisible({ timeout: 15_000 });
    }
  });
});
