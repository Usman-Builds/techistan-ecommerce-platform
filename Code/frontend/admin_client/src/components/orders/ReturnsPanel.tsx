"use client";

import { Loader2, PackageCheck } from "lucide-react";
import type { ReturnRequest } from "@/lib/api/orders";
import { useApproveReturn, useRejectReturn } from "@/lib/api/hooks/orders";
import { formatCents } from "@/lib/format";
import { ReturnStatusBadge } from "./OrderStatusBadge";

/**
 * Returns management (FR-508). Lists each ReturnRequest with its items; a REQUESTED
 * return can be approved (restock + best-effort refund) or rejected server-side.
 */
export function ReturnsPanel({
  orderId,
  returns,
  currency,
}: {
  orderId: string;
  returns: ReturnRequest[];
  currency: string;
}) {
  const approve = useApproveReturn(orderId);
  const reject = useRejectReturn(orderId);

  if (returns.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <PackageCheck className="h-4 w-4" aria-hidden /> Returns
      </h2>

      <ul className="mt-3 space-y-3">
        {returns.map((r) => {
          const units = r.items.reduce((n, i) => n + i.quantity, 0);
          const value = r.items.reduce(
            (sum, i) => sum + i.unitPrice * i.quantity,
            0,
          );
          const pending = r.status === "REQUESTED";
          return (
            <li key={r.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {units} item{units === 1 ? "" : "s"} ·{" "}
                  {formatCents(value, currency)}
                </span>
                <ReturnStatusBadge status={r.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.reasonCode.replace(/_/g, " ").toLowerCase()}
                {r.note ? ` — ${r.note}` : ""}
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {r.items.map((i) => (
                  <li key={i.orderItemId}>
                    {i.productTitle} × {i.quantity}
                  </li>
                ))}
              </ul>
              {r.refundAmount != null && r.refundAmount > 0 && (
                <p className="mt-1 text-xs">
                  Refunded {formatCents(r.refundAmount, currency)}
                </p>
              )}

              {pending && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => approve.mutate({ returnId: r.id })}
                    disabled={approve.isPending || reject.isPending}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {approve.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    )}
                    Approve & refund
                  </button>
                  <button
                    type="button"
                    onClick={() => reject.mutate({ returnId: r.id })}
                    disabled={approve.isPending || reject.isPending}
                    className="inline-flex flex-1 items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
