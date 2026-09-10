"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import type { AdminOrderDetail } from "@/lib/api/orders";
import { useRefundOrder } from "@/lib/api/hooks/orders";
import { ApiError } from "@/lib/api/client";
import { formatCents, dollarsToCents } from "@/lib/format";
import { PaymentStatusBadge } from "./OrderStatusBadge";

/**
 * Refund panel (FR-413). Calls PaymentService.processRefund (script 10) for a full
 * or partial refund. A blank amount refunds the full remaining balance.
 */
export function RefundPanel({ order }: { order: AdminOrderDetail }) {
  const [amount, setAmount] = useState("");
  const mutation = useRefundOrder(order.id);

  const refundable = order.grandTotal - order.refundedAmount;
  const hasCapturedPayment =
    order.paymentStatus === "SUCCEEDED" ||
    order.paymentStatus === "PARTIALLY_REFUNDED";

  const submit = async () => {
    let amountCents: number | undefined;
    if (amount.trim() !== "") {
      const cents = dollarsToCents(amount);
      if (cents == null || Number.isNaN(cents) || cents <= 0) return;
      amountCents = cents;
    }
    await mutation.mutateAsync({ amountCents });
    setAmount("");
  };

  const errorMessage =
    mutation.error instanceof ApiError ? mutation.error.message : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <RotateCcw className="h-4 w-4" aria-hidden /> Refund
        </h2>
        {order.paymentStatus && (
          <PaymentStatusBadge status={order.paymentStatus} />
        )}
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Captured</dt>
          <dd>{formatCents(order.grandTotal, order.currency)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Refunded</dt>
          <dd>{formatCents(order.refundedAmount, order.currency)}</dd>
        </div>
        <div className="flex justify-between font-medium">
          <dt>Refundable</dt>
          <dd>{formatCents(refundable, order.currency)}</dd>
        </div>
      </dl>

      {!hasCapturedPayment ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No captured payment to refund.
        </p>
      ) : refundable <= 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          This order is fully refunded.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Amount (blank = full ${formatCents(
              refundable,
              order.currency,
            )})`}
            aria-label="Refund amount in dollars"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Issue this refund?")) submit();
            }}
            disabled={mutation.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {mutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
            Issue refund
          </button>
          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
