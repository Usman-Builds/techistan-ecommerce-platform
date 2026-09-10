"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { OrderStatus } from "@/lib/api/orders";
import { useUpdateStatus } from "@/lib/api/hooks/orders";
import { ApiError } from "@/lib/api/client";
import { OrderStatusBadge } from "./OrderStatusBadge";

/**
 * Client-side mirror of the backend lifecycle map (order-status.ts). Used only to
 * offer valid options — the server re-validates every transition (NFR-208), so a
 * stale map can never authorize an illegal jump. REFUNDED is intentionally absent:
 * refunds go through the dedicated refund panel.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "SHIPPED", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function StatusControl({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const options = TRANSITIONS[status];
  const [next, setNext] = useState<OrderStatus | "">("");
  const [note, setNote] = useState("");
  const mutation = useUpdateStatus(orderId);

  const apply = async () => {
    if (!next) return;
    await mutation.mutateAsync({ status: next, note: note || undefined });
    setNext("");
    setNote("");
  };

  const errorMessage =
    mutation.error instanceof ApiError ? mutation.error.message : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Status</h2>
        <OrderStatusBadge status={status} />
      </div>

      {options.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          This order is in a terminal state — no further transitions.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <select
            value={next}
            onChange={(e) => setNext(e.target.value as OrderStatus)}
            aria-label="Next status"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Move to…</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Internal note (optional)"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={apply}
            disabled={!next || mutation.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
            Update status
          </button>
          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
