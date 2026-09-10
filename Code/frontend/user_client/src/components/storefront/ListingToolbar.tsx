"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ProductSort } from "@/lib/api/products";

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "top_rated", label: "Top rated" },
  { value: "best_selling", label: "Best selling" },
];

/**
 * Client controls for the category listing (script 14): sort + price-range
 * filter. State lives entirely in the URL (`?sort=&min=&max=&page=`) so results
 * are shareable and back-button-safe; changing any control resets to page 1. The
 * server component re-reads the params and re-renders the grid.
 */
export function ListingToolbar({
  sort,
  min,
  max,
}: {
  sort: ProductSort;
  min?: string;
  max?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [minVal, setMinVal] = useState(min ?? "");
  const [maxVal, setMaxVal] = useState(max ?? "");

  const push = (mutate: (sp: URLSearchParams) => void) => {
    const sp = new URLSearchParams(searchParams.toString());
    mutate(sp);
    sp.delete("page"); // any change resets pagination
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const onSort = (value: string) => push((sp) => sp.set("sort", value));

  const applyPrice = (e: React.FormEvent) => {
    e.preventDefault();
    push((sp) => {
      if (minVal.trim()) sp.set("min", minVal.trim());
      else sp.delete("min");
      if (maxVal.trim()) sp.set("max", maxVal.trim());
      else sp.delete("max");
    });
  };

  const clearPrice = () => {
    setMinVal("");
    setMaxVal("");
    push((sp) => {
      sp.delete("min");
      sp.delete("max");
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
      <form onSubmit={applyPrice} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="price-min" className="text-xs font-medium text-muted-foreground">
            Min price ($)
          </label>
          <input
            id="price-min"
            inputMode="decimal"
            value={minVal}
            onChange={(e) => setMinVal(e.target.value)}
            placeholder="0"
            className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="price-max" className="text-xs font-medium text-muted-foreground">
            Max price ($)
          </label>
          <input
            id="price-max"
            inputMode="decimal"
            value={maxVal}
            onChange={(e) => setMaxVal(e.target.value)}
            placeholder="Any"
            className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Apply
        </button>
        {(min || max) && (
          <button
            type="button"
            onClick={clearPrice}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Clear
          </button>
        )}
      </form>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Sort</span>
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
