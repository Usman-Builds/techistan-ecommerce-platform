"use client";

import Image from "next/image";
import { formatMoney } from "@/lib/utils/money";
import type { Cart } from "@/lib/api/cart";
import type { Order } from "@/lib/api/orders";
import { CouponField } from "@/components/storefront/CouponField";

/**
 * Persistent order-summary sidebar shown across all checkout steps (FR-401). It
 * lists the cart items and a totals block. Before an order exists it shows the
 * cart subtotal with shipping/tax deferred; once the server has computed the
 * order it shows the authoritative shipping, tax, discount, and grand total
 * (FR-404 — these are the server's numbers, never client math).
 */
export function OrderSummarySidebar({
  cart,
  order,
}: {
  cart: Cart | undefined;
  order: Order | null;
}) {
  const currency = order?.currency ?? "USD";
  const lines = cart?.items ?? [];

  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <h2 className="font-heading text-lg font-semibold">Order summary</h2>

        <ul className="space-y-3">
          {lines.map((line) => (
            <li key={line.id} className="flex gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                {line.image ? (
                  <Image
                    src={line.image.url}
                    alt={line.image.alt ?? line.title}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                ) : (
                  <span className="grid h-full place-items-center text-[10px] text-muted-foreground">
                    No image
                  </span>
                )}
                <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {line.quantity}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">{line.title}</p>
                {Object.keys(line.options).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {Object.values(line.options).join(" · ")}
                  </p>
                )}
              </div>
              <span className="text-sm font-medium">
                {formatMoney(line.lineSubtotal, currency)}
              </span>
            </li>
          ))}
          {lines.length === 0 && (
            <li className="text-sm text-muted-foreground">Your cart is empty.</li>
          )}
        </ul>

        {/* A code can still be entered here — right up until the order is
         * placed. Before this, the only coupon field on the whole storefront
         * was on /cart, so a shopper who reached checkout from the drawer had
         * nowhere to type one. Hidden once an order exists: its totals are
         * fixed and a field that cannot change them is a trap. */}
        {!order && (
          <div className="border-t border-border pt-4">
            <CouponField
              appliedCode={cart?.coupon?.valid ? cart.coupon.code : null}
              invalidMessage={
                cart?.coupon && !cart.coupon.valid ? cart.coupon.message : null
              }
            />
          </div>
        )}

        <dl className="space-y-2 border-t border-border pt-4 text-sm">
          <Row
            label="Subtotal"
            value={formatMoney(order?.subtotal ?? cart?.subtotal ?? 0, currency)}
          />
          {(order?.discountTotal ?? cart?.discountTotal ?? 0) > 0 && (
            <Row
              label={`Discount${order?.couponCode ? ` (${order.couponCode})` : cart?.coupon?.valid ? ` (${cart.coupon.code})` : ""}`}
              value={`−${formatMoney(order?.discountTotal ?? cart?.discountTotal ?? 0, currency)}`}
              accent
            />
          )}
          <Row
            label="Shipping"
            value={
              order
                ? order.shippingTotal === 0
                  ? "Free"
                  : formatMoney(order.shippingTotal, currency)
                : "Calculated next"
            }
            muted={!order}
          />
          <Row
            label="Tax"
            value={order ? formatMoney(order.taxTotal, currency) : "Calculated next"}
            muted={!order}
          />
          <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>
              {order
                ? formatMoney(order.grandTotal, currency)
                : formatMoney(cart?.total ?? 0, currency)}
            </dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          accent
            ? "text-success"
            : muted
              ? "text-muted-foreground"
              : "font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}
