"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { OrderDetail, ReturnReason } from "@/lib/api/orders";
import { useRequestReturn } from "@/lib/api/hooks/orders";
import { ApiError } from "@/lib/api/client";

const REASONS: { value: ReturnReason; label: string }[] = [
  { value: "DEFECTIVE", label: "Item is defective or damaged" },
  { value: "WRONG_ITEM", label: "Wrong item was sent" },
  { value: "NOT_AS_DESCRIBED", label: "Not as described" },
  { value: "NO_LONGER_NEEDED", label: "No longer needed" },
  { value: "ARRIVED_LATE", label: "Arrived too late" },
  { value: "OTHER", label: "Other" },
];

/**
 * Return request flow (script 11, Task 10, FR-508). Lets the customer pick which
 * items (and how many) to return, a reason, and an optional note, then submits to
 * POST /orders/:id/return. Functional here; visual polish lands in script 14.
 */
export function ReturnRequestForm({
  order,
  onDone,
}: {
  order: OrderDetail;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<ReturnReason>("DEFECTIVE");
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const mutation = useRequestReturn(order.id);

  const setQuantity = (itemId: string, value: number) =>
    setQty((prev) => ({ ...prev, [itemId]: value }));

  const selected = order.items
    .map((i) => ({ orderItemId: i.id, quantity: qty[i.id] ?? 0 }))
    .filter((i) => i.quantity > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.length === 0) return;
    await mutation.mutateAsync({ reasonCode: reason, items: selected, note });
    onDone();
  };

  const errorMessage =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.isError
        ? "Could not submit your return. Please try again."
        : null;

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-lg border border-border bg-card p-5"
    >
      <h3 className="font-heading text-lg font-semibold">Request a return</h3>

      <div className="space-y-2">
        <p className="text-sm font-medium">Which items?</p>
        {order.items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">
              {item.productTitle}
              <span className="text-muted-foreground">
                {" "}
                · purchased {item.quantity}
              </span>
            </span>
            <label className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Return</span>
              <select
                value={qty[item.id] ?? 0}
                onChange={(e) =>
                  setQuantity(item.id, Number(e.target.value))
                }
                aria-label={`Quantity to return for ${item.productTitle}`}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {Array.from({ length: item.quantity + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="return-reason" className="text-sm font-medium">
          Reason
        </label>
        <select
          id="return-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as ReturnReason)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="return-note" className="text-sm font-medium">
          Additional details (optional)
        </label>
        <textarea
          id="return-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={selected.length === 0 || mutation.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          Submit return
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
