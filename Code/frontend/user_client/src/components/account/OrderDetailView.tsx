"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Loader2,
  Truck,
  XCircle,
} from "lucide-react";
import { useOrder, useCancelOrder } from "@/lib/api/hooks/orders";
import { API_URL } from "@/lib/api/client";
import { formatMoney } from "@/lib/utils/money";
import {
  OrderStatusBadge,
  ReturnStatusBadge,
} from "./OrderStatusBadge";
import { ReturnRequestForm } from "./ReturnRequestForm";

/**
 * Account → single order detail (script 11, FR-505). Itemized receipt, live
 * status, carrier tracking link, customer-visible notes, invoice download, plus
 * the cancel (unpaid) and return (delivered) actions.
 */
export function OrderDetailView() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: order, isPending, isError } = useOrder(id);
  const cancel = useCancelOrder(id);
  const [returning, setReturning] = useState(false);

  if (isPending) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }
  if (isError || !order) {
    return (
      <div className="py-24 text-center">
        <p className="text-destructive">Order not found.</p>
        <BackLink />
      </div>
    );
  }

  const c = order.currency;
  const canCancel = order.status === "PENDING";
  const canReturn =
    order.status === "DELIVERED" || order.status === "COMPLETED";
  const invoiceUrl = `${API_URL}/orders/${order.id}/invoice`;

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            {order.orderNumber}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Placed{" "}
            {new Date(order.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <OrderStatusBadge status={order.status} />
          <a
            href={invoiceUrl}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <Download className="h-4 w-4" aria-hidden /> Invoice
          </a>
        </div>
      </div>

      {/* Tracking */}
      {order.shipmentEvents.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4" aria-hidden /> Shipment tracking
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {order.shipmentEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">
                  {new Date(e.occurredAt).toLocaleDateString("en-US")}
                </span>
                <span className="font-medium">{e.carrier}</span>
                <span>{e.trackingNumber}</span>
                {e.trackingUrl && (
                  <a
                    href={e.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Track package →
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Items + totals */}
      <div className="rounded-lg border border-border">
        <ul className="divide-y divide-border">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 p-4 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{item.productTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {Object.entries(item.variantOptions)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")}
                  {" · "}Qty {item.quantity}
                </p>
              </div>
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
          {order.refundedAmount > 0 && (
            <Row
              label="Refunded"
              value={`−${formatMoney(order.refundedAmount, c)}`}
            />
          )}
        </dl>
      </div>

      {/* Customer-visible notes */}
      {order.notes.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Updates from Techistan</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {order.notes.map((n) => (
              <li key={n.id}>
                <p className="text-muted-foreground text-xs">
                  {new Date(n.createdAt).toLocaleDateString("en-US")}
                </p>
                <p>{n.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Existing returns */}
      {order.returns.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Returns</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {order.returns.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span>
                  {r.items.reduce((n, i) => n + i.quantity, 0)} item(s) ·{" "}
                  {r.reasonCode.replace(/_/g, " ").toLowerCase()}
                </span>
                <div className="flex items-center gap-2">
                  {r.refundAmount != null && r.refundAmount > 0 && (
                    <span className="text-muted-foreground">
                      {formatMoney(r.refundAmount, c)} refunded
                    </span>
                  )}
                  <ReturnStatusBadge status={r.status} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {canCancel && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Cancel this order?")) cancel.mutate();
            }}
            disabled={cancel.isPending}
            className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" aria-hidden /> Cancel order
          </button>
        )}
        {canReturn && !returning && (
          <button
            type="button"
            onClick={() => setReturning(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Request a return
          </button>
        )}
      </div>

      {returning && (
        <ReturnRequestForm order={order} onDone={() => setReturning(false)} />
      )}
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

function BackLink() {
  return (
    <Link
      href="/account/orders"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to orders
    </Link>
  );
}
