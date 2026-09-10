"use client";

import { CartButton } from "./CartButton";
import { CartDrawer } from "./CartDrawer";
import { useCart } from "@/lib/api/hooks/cart";

/**
 * App-wide cart chrome (script 09). Mounts a floating cart trigger + the slide-
 * over drawer, and kicks off the authoritative `GET /cart` so the badge/drawer
 * hydrate from server truth. This is functional scaffolding — script 14 folds
 * the cart button into the real storefront header.
 */
export function StorefrontCart() {
  // Hydrate the cart query (and, via the hook, the Zustand mirror) once per app.
  useCart();

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40">
        <CartButton />
      </div>
      <CartDrawer />
    </>
  );
}
