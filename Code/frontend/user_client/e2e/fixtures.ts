import { test as base, type Page, type FrameLocator } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Shared E2E fixtures: Stripe TEST cards, the seeded admin, and helpers for the
 * Stripe Payment Element (which renders inside a cross-origin iframe) + a unique
 * email per run. The seeded product slug is written by global-setup.ts.
 */
export const STRIPE_TEST_CARDS = {
  // https://docs.stripe.com/testing
  success: "4242 4242 4242 4242",
  decline: "4000 0000 0000 0002", // generic decline → retry path
} as const;

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@techistan.dev",
  password: process.env.E2E_ADMIN_PASSWORD ?? "Admin!2345",
} as const;

export const ADMIN_URL = process.env.E2E_ADMIN_URL ?? "http://localhost:3002";

/** A unique email so register/login journeys don't collide across runs. */
export function uniqueEmail(prefix = "shopper"): string {
  return `${prefix}+${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
}

/** The ACTIVE product slug seeded for the run (stashed by global-setup). */
export function seededProductSlug(): string {
  try {
    const raw = readFileSync(join(__dirname, ".e2e-state.json"), "utf8");
    return JSON.parse(raw).productSlug as string;
  } catch {
    throw new Error(
      "No seeded product found. Run the backend seed (npm run seed) before the E2E suite — see e2e/README.md.",
    );
  }
}

/**
 * Fill the Stripe Payment Element. Stripe mounts its card fields in an iframe;
 * we target it by title and type into the shared card-number/expiry/cvc inputs.
 * Kept in one place so a Stripe UI change is a one-line fix.
 */
export async function fillStripeCard(page: Page, cardNumber: string): Promise<void> {
  const stripe: FrameLocator = page.frameLocator(
    'iframe[title="Secure payment input frame"]',
  );
  await stripe.getByPlaceholder("1234 1234 1234 1234").fill(cardNumber);
  await stripe.getByPlaceholder("MM / YY").fill("12 / 34");
  await stripe.getByPlaceholder("CVC").fill("123");
  const zip = stripe.getByPlaceholder("ZIP");
  if (await zip.count()) await zip.fill("90001");
}

/** Fill the checkout shipping form with a valid US address. */
export async function fillShipping(page: Page, email: string): Promise<void> {
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/full name/i).fill("Jane Buyer");
  await page.getByLabel(/address|line 1/i).first().fill("1 Market St");
  await page.getByLabel(/city/i).fill("Springfield");
  await page.getByLabel(/state/i).fill("CA");
  await page.getByLabel(/zip|postal/i).fill("90001");
  await page.getByLabel(/country/i).fill("US");
}

export const test = base;
export { expect } from "@playwright/test";
