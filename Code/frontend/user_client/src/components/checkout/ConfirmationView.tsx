"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/utils/money";
import { useOrder } from "@/lib/api/hooks/orders";
import { track } from "@/lib/analytics/track";

/**
 * Checkout step 4 — confirmation (FR-401). Reads the order id from the URL and
 * polls the order until the webhook flips it to CONFIRMED (payment truth comes
 * from the server webhook, not the client redirect). Handles the still-processing
 * and payment-failed states too.
 */
export function ConfirmationView() {
  const params = useSearchParams();
  const orderId = params.get("orderId");
  const { data: order, isPending } = useOrder(orderId);

  // Fire purchase exactly once, when the order settles to a confirmed state
  // (server-truth, not the client redirect) — the poll re-renders otherwise
  // would double-count (NFR-705).
  const trackedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      order &&
      order.status !== "PENDING" &&
      order.paymentStatus !== "FAILED" &&
      trackedRef.current !== order.orderNumber
    ) {
      trackedRef.current = order.orderNumber;
      track("purchase", {
        order: order.orderNumber,
        value: order.grandTotal / 100,
        currency: order.currency,
        items: order.items.length,
      });
    }
  }, [order]);

  if (!orderId) {
    return (
      <Centered
        icon={<XCircle className="h-12 w-12 text-destructive" aria-hidden />}
        title="Missing order reference"
        subtitle="We couldn't find the order to confirm."
      >
        <ContinueLink />
      </Centered>
    );
  }

  if (isPending || !order) {
    return (
      <Centered
        icon={<Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden />}
        title="Finalizing your order…"
        subtitle="Hang tight while we confirm your payment."
      />
    );
  }

  if (order.paymentStatus === "FAILED") {
    return (
      <Centered
        icon={<XCircle className="h-12 w-12 text-destructive" aria-hidden />}
        title="Payment failed"
        subtitle={`Order ${order.orderNumber} was not charged. You can try again.`}
      >
        <Link
          href="/checkout"
          className="mt-6 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Return to checkout
        </Link>
      </Centered>
    );
  }

  // Still PENDING → the webhook has not landed yet; keep the shopper informed
  // while useOrder continues to poll.
  if (order.status === "PENDING") {
    return (
      <Centered
        icon={<Clock className="h-12 w-12 text-warning" aria-hidden />}
        title="Payment processing…"
        subtitle={`We're confirming payment for order ${order.orderNumber}. This page updates automatically.`}
      />
    );
  }

  const c = order.currency;
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <CheckCircle2
        className="mx-auto h-14 w-14 text-success"
        aria-hidden
      />
      <h1 className="mt-4 font-heading text-2xl font-bold">Thank you!</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your order{" "}
        <span className="font-medium text-foreground">{order.orderNumber}</span>{" "}
        is confirmed. A receipt is on its way to {order.email}.
      </p>

      <div className="mt-8 rounded-lg border border-border text-left">
        <ul className="divide-y divide-border">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 p-4 text-sm">
              <span>
                {item.productTitle}
                <span className="text-muted-foreground"> × {item.quantity}</span>
              </span>
              <span className="font-medium">{formatMoney(item.total, c)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-2 border-t border-border p-4 text-sm">
          <Row label="Subtotal" value={formatMoney(order.subtotal, c)} />
          {order.discountTotal > 0 && (
            <Row
              label="Discount"
              value={`−${formatMoney(order.discountTotal, c)}`}
            />
          )}
          <Row
            label="Shipping"
            value={
              order.shippingTotal === 0
                ? "Free"
                : formatMoney(order.shippingTotal, c)
            }
          />
          <Row label="Tax" value={formatMoney(order.taxTotal, c)} />
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatMoney(order.grandTotal, c)}</dd>
          </div>
        </dl>
      </div>

      <ContinueLink />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function ContinueLink() {
  return (
    <Link
      href="/search"
      className="mt-6 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
    >
      Continue shopping
    </Link>
  );
}

function Centered({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <div className="mx-auto flex justify-center">{icon}</div>
      <h1 className="mt-4 font-heading text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  );
}
