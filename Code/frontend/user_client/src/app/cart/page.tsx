import type { Metadata } from "next";
import { CartPageView } from "@/components/storefront/CartPageView";

export const metadata: Metadata = {
  title: "Cart — Techistan",
  description: "Review your Techistan cart, apply a coupon, and estimate shipping.",
};

/**
 * Storefront cart page (script 09). The cart works for guests (signed cookie) and
 * customers (JWT) alike, so this route is intentionally NOT gated by the proxy.
 */
export default function CartPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <CartPageView />
    </main>
  );
}
