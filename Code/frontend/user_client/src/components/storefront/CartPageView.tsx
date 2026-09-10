"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ShoppingBag, Truck } from "lucide-react";
import { formatCents } from "@/lib/format";
import {
  useCart,
  useClearCart,
  useEstimateShipping,
} from "@/lib/api/hooks/cart";
import { CartLineItem } from "./CartLineItem";
import { CouponField } from "./CouponField";

/**
 * Full /cart page (script 09, Task 12): line items, a coupon field with success/
 * error feedback, an estimated-shipping preview from store zones, and the order
 * summary + checkout CTA (checkout itself is script 10).
 */
export function CartPageView() {
  const { data: cart, isPending } = useCart();

  if (isPending) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="py-24 text-center">
        <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 font-heading text-2xl font-bold">Your cart is empty</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find something you love.
        </p>
        <Link
          href="/search"
          className="mt-6 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_22rem]">
      {/* Line items */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold">
            Cart{" "}
            <span className="text-base font-normal text-muted-foreground">
              ({cart.itemCount} item{cart.itemCount === 1 ? "" : "s"})
            </span>
          </h1>
          <ClearButton />
        </div>
        <ul className="divide-y divide-border border-t border-border">
          {cart.items.map((line) => (
            <li key={line.id}>
              <CartLineItem line={line} />
            </li>
          ))}
        </ul>
      </section>

      {/* Summary */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="space-y-5 rounded-lg border border-border bg-card p-5">
          <CouponField
            appliedCode={cart.coupon?.valid ? cart.coupon.code : null}
            invalidMessage={
              cart.coupon && !cart.coupon.valid ? cart.coupon.message : null
            }
          />

          <ShippingEstimator />

          <dl className="space-y-2 border-t border-border pt-4 text-sm">
            <Row label="Subtotal" value={formatCents(cart.subtotal)} />
            {cart.coupon?.valid && cart.discountTotal > 0 && (
              <Row
                label={`Discount (${cart.coupon.code})`}
                value={`−${formatCents(cart.discountTotal)}`}
                accent
              />
            )}
            <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Estimated total</dt>
              <dd>{formatCents(cart.total)}</dd>
            </div>
            <p className="text-xs text-muted-foreground">
              Shipping &amp; taxes finalized at checkout.
            </p>
          </dl>

          <Link
            href="/checkout"
            className="block rounded-md bg-primary py-3 text-center text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Proceed to checkout
          </Link>
        </div>
      </aside>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={accent ? "text-success" : "font-medium"}>
        {value}
      </dd>
    </div>
  );
}

function ClearButton() {
  const clear = useClearCart();
  return (
    <button
      type="button"
      onClick={() => clear.mutate()}
      disabled={clear.isPending}
      className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
    >
      Clear cart
    </button>
  );
}

function ShippingEstimator() {
  const [country, setCountry] = useState("US");
  const [postalCode, setPostalCode] = useState("");
  const estimate = useEstimateShipping();

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Truck className="h-4 w-4" aria-hidden /> Estimate shipping
      </p>
      <div className="flex gap-2">
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
          placeholder="US"
          aria-label="Country code"
          className="w-16 rounded-md border border-input bg-background px-2 py-2 text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <input
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          placeholder="Postal code"
          aria-label="Postal code"
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={() => estimate.mutate({ country, postalCode })}
          disabled={estimate.isPending}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {estimate.isPending ? "…" : "Go"}
        </button>
      </div>
      {estimate.data && (
        <p className="text-sm">
          <span className="text-muted-foreground">{estimate.data.label}: </span>
          <span className="font-medium">
            {estimate.data.amountCents === 0
              ? "Free"
              : formatCents(estimate.data.amountCents)}
          </span>
        </p>
      )}
    </div>
  );
}
