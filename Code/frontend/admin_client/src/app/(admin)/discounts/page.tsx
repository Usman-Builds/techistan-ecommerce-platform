"use client";

import { useState } from "react";
import { Loader2, Pencil, Percent, Plus, Trash2 } from "lucide-react";
import {
  useAutomaticDiscount,
  useAutomaticDiscounts,
  useDeleteAutomaticDiscount,
} from "@/lib/api/hooks/promotions";
import type {
  AutomaticDiscount,
  AutomaticDiscountRule,
} from "@/lib/api/promotions";
import { AutomaticDiscountForm } from "@/components/promotions/AutomaticDiscountForm";
import { ScopeSummary } from "@/components/promotions/PromotionScopeFields";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCents } from "@/lib/format";

function ruleSummary(rule: AutomaticDiscountRule): string {
  const gates: string[] = [];
  if (rule.minQty != null) gates.push(`buy ${rule.minQty}+`);
  if (rule.minSubtotal != null)
    gates.push(`spend ${formatCents(rule.minSubtotal)}+`);
  let effect = "";
  if (rule.percentOff) effect = `${rule.percentOff}% off`;
  else if (rule.amountOff) effect = `${formatCents(rule.amountOff)} off`;
  else if (rule.freeShipping) effect = "free shipping";
  const prefix = gates.length ? `${gates.join(", ")} → ` : "";
  return `${prefix}${effect}`;
}

/**
 * The editor needs a discount's SCOPE TARGETS, which the list endpoint only
 * counts. Rendering the form behind this loader keeps the list cheap while
 * still giving the form the hydrated record it needs.
 */
function EditDiscount({ id, onDone }: { id: string; onDone: () => void }) {
  const { data, isLoading, isError } = useAutomaticDiscount(id);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive">
        Could not load this discount.
      </p>
    );
  }
  return <AutomaticDiscountForm key={id} discount={data} onDone={onDone} />;
}

export default function DiscountsPage() {
  const { data, isLoading, isError } = useAutomaticDiscounts();
  const del = useDeleteAutomaticDiscount();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AutomaticDiscount | null>(
    null,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
            <Percent className="h-6 w-6" aria-hidden /> Automatic discounts
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cart rules that apply themselves — no code to type. The
            highest-priority matching rule applies, stacked with at most one
            coupon. Restrict a rule to categories or products to run something
            like &ldquo;10% off all laptops this weekend&rdquo;.
          </p>
        </div>
        {!creating && !editingId && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden /> New discount
          </button>
        )}
      </div>

      {creating && <AutomaticDiscountForm onDone={() => setCreating(false)} />}
      {editingId && (
        <EditDiscount id={editingId} onDone={() => setEditingId(null)} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      ) : isError ? (
        <p className="py-16 text-center text-destructive">
          Failed to load discounts.
        </p>
      ) : !data || data.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No automatic discounts yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{d.name}</span>
                  <StatusBadge status={d.status} />
                  <ScopeSummary scope={d.scope} counts={d._count} />
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {ruleSummary(d.rule)} · priority {d.priority}
                  {!d.appliesToSaleItems && " · excludes sale items"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setEditingId(d.id);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  <Pencil className="h-4 w-4" aria-hidden /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(d)}
                  disabled={del.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : ""}
        description="Carts will stop receiving this discount immediately. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={del.isPending}
        onConfirm={async () => {
          if (deleteTarget) await del.mutateAsync(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
