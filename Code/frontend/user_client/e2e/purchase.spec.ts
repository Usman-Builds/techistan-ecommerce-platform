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
 * Guest purchase (SRD §11) + payment-failure recovery (Task 6). Requires Stripe
 * TEST mode on the backend (STRIPE_SECRET_KEY=sk_test_…, STRIPE_WEBHOOK_SECRET)
 * and the Stripe CLI (or a test webhook) forwarding events to the backend so the
 * order flips to CONFIRMED. See e2e/README.md.
 */
test.describe("guest checkout", () => {
  test("browse → add to cart → pay with a test card → confirmation", async ({ page }) => {
    await page.goto(`/products/${seededProductSlug()}`);
    await page.getByRole("button", { name: /add to cart/i }).click();

    await page.goto("/checkout");
    await fillShipping(page, uniqueEmail("guest"));
    await page.getByRole("button", { name: /continue|review|next/i }).first().click();

    // Review → payment.
    await page.getByRole("button", { name: /continue to payment|pay|place order/i }).first().click();
    await fillStripeCard(page, STRIPE_TEST_CARDS.success);
    await page.getByRole("button", { name: /pay|place order|confirm/i }).first().click();

    // Confirmation view polls the order until the webhook confirms it.
    await expect(page.getByText(/thank you|order (is )?confirmed/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/ORD-/)).toBeVisible();
  });

  test("payment failure then a successful retry", async ({ page }) => {
    await page.goto(`/products/${seededProductSlug()}`);
    await page.getByRole("button", { name: /add to cart/i }).click();
    await page.goto("/checkout");
    await fillShipping(page, uniqueEmail("retry"));
    await page.getByRole("button", { name: /continue|review|next/i }).first().click();
    await page.getByRole("button", { name: /continue to payment|pay|place order/i }).first().click();

    // Decline card → expect a visible failure, stay on the payment step.
    await fillStripeCard(page, STRIPE_TEST_CARDS.decline);
    await page.getByRole("button", { name: /pay|place order|confirm/i }).first().click();
    await expect(page.getByText(/declined|failed|try again/i)).toBeVisible({
      timeout: 30_000,
    });

    // Retry with the good card → success.
    await fillStripeCard(page, STRIPE_TEST_CARDS.success);
    await page.getByRole("button", { name: /pay|place order|confirm|retry/i }).first().click();
    await expect(page.getByText(/thank you|order (is )?confirmed/i)).toBeVisible({
      timeout: 30_000,
    });
  });
});
