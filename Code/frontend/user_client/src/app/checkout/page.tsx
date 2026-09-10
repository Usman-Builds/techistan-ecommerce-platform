import type { Metadata } from "next";
import { CheckoutFlow } from "@/components/checkout/CheckoutFlow";

export const metadata: Metadata = {
  title: "Checkout — Techistan",
  description: "Complete your Techistan purchase.",
};

/**
 * Checkout page (script 10). NOT proxy-gated — guest checkout is supported
 * (FR-402); the cart identity (guest cookie or customer JWT) is resolved by the
 * backend. The flow itself is client-side (Stripe Elements + stepper).
 */
export default function CheckoutPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 font-heading text-2xl font-bold">Checkout</h1>
      <CheckoutFlow />
    </main>
  );
}
