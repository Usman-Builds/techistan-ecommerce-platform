"use client";

import { formatMoney } from "@/lib/utils/money";
import type { Order } from "@/lib/api/orders";

/**
 * Checkout step 2 — review (FR-404). Shows the itemized order using the
 * SERVER-computed totals returned by POST /orders (subtotal, shipping, tax,
 * discount, grand total). The client never recomputes these.
 */
export function ReviewStep({
  order,
  onBack,
  onContinue,
}: {
  order: Order;
  onBack: () => void;
  onContinue: () => void;
}) {
  const c = order.currency;
  const addr = order.shippingAddress;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border">
        <ul className="divide-y divide-border">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.productTitle}</p>
                {Object.keys(item.variantOptions).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {Object.entries(item.variantOptions)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatMoney(item.unitPrice, c)} × {item.quantity}
                </p>
              </div>
              <span className="text-sm font-semibold">
                {formatMoney(item.total, c)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border p-4 text-sm">
        <h3 className="mb-1 font-medium">Ship to</h3>
        <address className="not-italic text-muted-foreground">
          {addr.fullName}
          <br />
          {addr.line1}
          {addr.line2 ? `, ${addr.line2}` : ""}
          <br />
          {addr.city}, {addr.state} {addr.postalCode}, {addr.country}
        </address>
      </section>

      <dl className="space-y-2 text-sm">
        <Row label="Subtotal" value={formatMoney(order.subtotal, c)} />
        {order.discountTotal > 0 && (
          <Row
            label={`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`}
            value={`−${formatMoney(order.discountTotal, c)}`}
            accent
          />
        )}
        <Row
          label="Shipping"
          value={
            order.shippingTotal === 0 ? "Free" : formatMoney(order.shippingTotal, c)
          }
        />
        <Row label="Tax" value={formatMoney(order.taxTotal, c)} />
        <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd>{formatMoney(order.grandTotal, c)}</dd>
        </div>
      </dl>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-border px-4 py-3 text-sm font-medium hover:bg-muted"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="flex-1 rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Continue to payment
        </button>
      </div>
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
