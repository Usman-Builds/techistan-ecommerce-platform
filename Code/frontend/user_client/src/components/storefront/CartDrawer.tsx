"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ShoppingBag, X } from "lucide-react";
import { formatCents } from "@/lib/format";
import { useCart } from "@/lib/api/hooks/cart";
import { useCartStore } from "@/lib/store/cart-store";
import { CartLineItem } from "./CartLineItem";
import { CouponField } from "./CouponField";

/**
 * Slide-over cart (script 09, Task 12). Reads the authoritative cart via useCart
 * and closes on Escape / backdrop click. Quantity + removal live on each line
 * (CartLineItem). The checkout CTA links to /checkout (built in script 10).
 */
export function CartDrawer() {
  const { data: cart, isPending } = useCart();
  const isOpen = useCartStore((s) => s.isOpen);
  const close = useCartStore((s) => s.close);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  const items = cart?.items ?? [];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Shopping cart"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={close}
            aria-hidden
          />
          <motion.aside
            className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-card shadow-xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25 }}
          >
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="inline-flex items-center gap-2 font-heading text-lg font-semibold">
                <ShoppingBag className="h-5 w-5" aria-hidden /> Your cart
                {cart && cart.itemCount > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    ({cart.itemCount})
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close cart"
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4">
              {isPending ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Loading…
                </p>
              ) : items.length === 0 ? (
                <div className="py-16 text-center">
                  <ShoppingBag
                    className="mx-auto h-10 w-10 text-muted-foreground"
                    aria-hidden
                  />
                  <p className="mt-3 text-sm font-medium">Your cart is empty</p>
                  <Link
                    href="/search"
                    onClick={close}
                    className="mt-1 inline-block text-sm text-primary hover:underline"
                  >
                    Browse products
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {items.map((line) => (
                    <li key={line.id}>
                      <CartLineItem line={line} compact />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {items.length > 0 && (
              <footer className="space-y-3 border-t border-border px-4 py-4">
                {/* The offers list is suppressed here: the drawer is a narrow
                 * column and its job is to get you to checkout, not to browse
                 * promotions. The field itself stays, because a shopper who
                 * already has a code should not have to leave to use it. */}
                <CouponField
                  appliedCode={cart?.coupon?.valid ? cart.coupon.code : null}
                  invalidMessage={
                    cart?.coupon && !cart.coupon.valid
                      ? cart.coupon.message
                      : null
                  }
                  showOffers={false}
                />

                <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">
                    {formatCents(cart?.subtotal ?? 0)}
                  </span>
                </div>
                {cart?.coupon?.valid && cart.discountTotal > 0 && (
                  <div className="flex items-center justify-between text-sm text-success">
                    <span>Discount ({cart.coupon.code})</span>
                    <span>−{formatCents(cart.discountTotal)}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Shipping &amp; taxes calculated at checkout.
                </p>
                <Link
                  href="/cart"
                  onClick={close}
                  className="block rounded-md border border-border py-2 text-center text-sm font-medium hover:bg-muted"
                >
                  View cart
                </Link>
                <Link
                  href="/checkout"
                  onClick={close}
                  className="block rounded-md bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Proceed to checkout
                </Link>
              </footer>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
