"use client";

import { useState } from "react";
import { Loader2, Tag, X } from "lucide-react";
import type { ProductListItem } from "@/lib/api/products";
import { useClearSale, useSetSale } from "@/lib/api/hooks/promotions";
import { ApiError } from "@/lib/api/client";

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function fromLocalInput(v: string): string | null {
  return v.trim() ? new Date(v).toISOString() : null;
}

/** Set or clear a scheduled percentage sale across every variant of a product. */
export function SalePanel({ product }: { product: ProductListItem }) {
  const setSale = useSetSale();
  const clearSale = useClearSale();
  const [percentOff, setPercentOff] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setMsg(null);
    setError(null);
    const pct = parseInt(percentOff, 10);
    if (!Number.isFinite(pct) || pct < 1 || pct > 99) {
      setError("Enter a percentage between 1 and 99.");
      return;
    }
    try {
      const res = await setSale.mutateAsync({
        productId: product.id,
        input: {
          percentOff: pct,
          saleStartsAt: fromLocalInput(startsAt),
          saleEndsAt: fromLocalInput(endsAt),
        },
      });
      setMsg(`Sale applied to ${res.variantsUpdated} variant(s).`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to set sale.");
    }
  };

  const clear = async () => {
    setMsg(null);
    setError(null);
    try {
      await clearSale.mutateAsync(product.id);
      setMsg("Sale cleared.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to clear sale.");
    }
  };

  const busy = setSale.isPending || clearSale.isPending;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="grid gap-3 sm:grid-cols-[6rem_1fr_1fr]">
        <div>
          <label className="mb-1 block text-xs font-medium">% off</label>
          <input
            value={percentOff}
            onChange={(e) => setPercentOff(e.target.value)}
            className={inputCls}
            inputMode="numeric"
            placeholder="20"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Starts (optional)</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Ends (optional)</label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={apply}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Tag className="h-4 w-4" aria-hidden />
          )}
          Set sale
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          <X className="h-4 w-4" aria-hidden /> Clear sale
        </button>
        {msg && <span className="text-xs text-success">{msg}</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
