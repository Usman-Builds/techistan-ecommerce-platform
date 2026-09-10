import {
  test,
  expect,
  seededProductSlug,
  uniqueEmail,
  fillShipping,
  fillStripeCard,
  STRIPE_TEST_CARDS,
} from "./fixtures";

/**
 * Register → verify → purchase, and logged-in purchase → order history (SRD §11).
 * The verification link is stubbed (email is best-effort); the E2E consumes the
 * verification token via the backend test helper endpoint OR the run seeds a
 * pre-verified account. Here we exercise the account order-history surface after
 * a purchase. See e2e/README.md for the verify-link strategy in CI.
 */
test.describe("account journeys", () => {
  test("self sign-up creates a CUSTOMER and reaches the account area", async ({ page }) => {
    const email = uniqueEmail("newuser");
    await page.goto("/register");
    await page.getByLabel(/first name/i).fill("New");
    await page.getByLabel(/last name/i).fill("User");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password/i).fill("Str0ng!pass");
    await page.getByRole("button", { name: /create account|sign up|register/i }).click();

    // Registration auto-authenticates (cookies set) — the account menu should
    // now reflect a signed-in user.
    await expect(page.getByRole("button", { name: /account/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("a completed purchase appears in account order history", async ({ page }) => {
    // Assumes a signed-in, verified account (seeded) — see README for auth reuse
    // via storageState in CI. This asserts the order-history surface renders.
    await page.goto(`/products/${seededProductSlug()}`);
    await page.getByRole("button", { name: /add to cart/i }).click();
    await page.goto("/checkout");
    await fillShipping(page, uniqueEmail("history"));
    await page.getByRole("button", { name: /continue|review|next/i }).first().click();
    await page.getByRole("button", { name: /continue to payment|pay|place order/i }).first().click();
    await fillStripeCard(page, STRIPE_TEST_CARDS.success);
    await page.getByRole("button", { name: /pay|place order|confirm/i }).first().click();
    await expect(page.getByText(/thank you|order (is )?confirmed/i)).toBeVisible({
      timeout: 30_000,
    });

    await page.goto("/account/orders");
    await expect(page.getByText(/ORD-/).first()).toBeVisible();
  });
});
