"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { useAdminOrder } from "@/lib/api/hooks/orders";
import { invoiceUrl, type OrderAddress } from "@/lib/api/orders";
import { formatCents } from "@/lib/format";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { StatusControl } from "@/components/orders/StatusControl";
import { TrackingForm } from "@/components/orders/TrackingForm";
import { RefundPanel } from "@/components/orders/RefundPanel";
import { NotesPanel } from "@/components/orders/NotesPanel";
import { ReturnsPanel } from "@/components/orders/ReturnsPanel";

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: order, isLoading, isError } = useAdminOrder(id);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }
  if (isError || !order) {
    return (
      <div className="mx-auto max-w-5xl py-24 text-center">
        <p className="text-destructive">Order not found.</p>
        <BackLink />
      </div>
    );
  }

  const c = order.currency;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-bold">
              {order.orderNumber}
            </h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(order.createdAt).toLocaleString("en-US")} · {order.email}
          </p>
        </div>
        <a
          href={invoiceUrl(order.id)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          <Download className="h-4 w-4" aria-hidden /> Invoice
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Main column */}
        <div className="space-y-6">
          {/* Items + totals */}
          <div className="rounded-lg border border-border">
            <ul className="divide-y divide-border">
              {order.items.map((item) => (
                <li
                  key={item.id}
                  className="flex justify-between gap-4 p-4 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{item.productTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {Object.entries(item.variantOptions)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ")}
                      {" · "}
                      {item.sku} · Qty {item.quantity} ×{" "}
                      {formatCents(item.unitPrice, c)}
                    </p>
                  </div>
                  <span className="font-medium">
                    {formatCents(item.total, c)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="space-y-2 border-t border-border p-4 text-sm">
              <Row label="Subtotal" value={formatCents(order.subtotal, c)} />
              {order.discountTotal > 0 && (
                <Row
                  label={
                    order.couponCode
                      ? `Discount (${order.couponCode})`
                      : "Discount"
                  }
                  value={`−${formatCents(order.discountTotal, c)}`}
                />
              )}
              <Row
                label="Shipping"
                value={
                  order.shippingTotal === 0
                    ? "Free"
                    : formatCents(order.shippingTotal, c)
                }
              />
              <Row label="Tax" value={formatCents(order.taxTotal, c)} />
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd>{formatCents(order.grandTotal, c)}</dd>
              </div>
              {order.refundedAmount > 0 && (
                <Row
                  label="Refunded"
                  value={`−${formatCents(order.refundedAmount, c)}`}
                />
              )}
            </dl>
          </div>

          {/* Addresses */}
          <div className="grid gap-4 sm:grid-cols-2">
            <AddressCard title="Shipping" address={order.shippingAddress} />
            <AddressCard title="Billing" address={order.billingAddress} />
          </div>

          <NotesPanel orderId={order.id} notes={order.notes} />
          <ReturnsPanel
            orderId={order.id}
            returns={order.returns}
            currency={c}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <StatusControl orderId={order.id} status={order.status} />
          <TrackingForm orderId={order.id} events={order.shipmentEvents} />
          <RefundPanel order={order} />
        </div>
      </div>
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

function AddressCard({
  title,
  address,
}: {
  title: string;
  address: OrderAddress;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm">
      <h3 className="mb-1.5 font-semibold">{title}</h3>
      <address className="not-italic text-muted-foreground">
        {address.fullName}
        <br />
        {address.line1}
        {address.line2 && (
          <>
            <br />
            {address.line2}
          </>
        )}
        <br />
        {[address.city, address.state, address.postalCode]
          .filter(Boolean)
          .join(", ")}
        <br />
        {address.country}
        {address.phone && (
          <>
            <br />
            {address.phone}
          </>
        )}
      </address>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/orders"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to orders
    </Link>
  );
}
