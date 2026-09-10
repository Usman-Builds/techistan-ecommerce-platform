/**
 * Stripe.js loader (script 10, Task 8). Loads Stripe once with the PUBLISHABLE
 * key (safe to expose) and memoizes the promise. Returns null when the key is
 * unset so the Payment step can degrade gracefully instead of throwing.
 */
import { loadStripe, type Stripe } from "@stripe/stripe-js";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

let stripePromise: Promise<Stripe | null> | null = null;

/** Memoized Stripe.js instance, or null when no publishable key is configured. */
export function getStripe(): Promise<Stripe | null> | null {
  if (!PUBLISHABLE_KEY) return null;
  if (!stripePromise) {
    stripePromise = loadStripe(PUBLISHABLE_KEY);
  }
  return stripePromise;
}

export const isStripeConfigured = Boolean(PUBLISHABLE_KEY);
