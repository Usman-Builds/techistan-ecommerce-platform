"use client";

import { useMemo } from "react";
import type { ProductStatus, StockFilter } from "@/lib/api/products";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { AdvancedFilters, FilterSelect } from "@/components/ui/FilterBar";
import { Field, Input, Toggle } from "@/components/ui/Form";
import { dollarsToCents } from "@/lib/format";

/**
 * Every filter the admin product list supports, as one value object.
 *
 * Kept as a single object rather than a dozen `useState`s so the page can reset
 * it, count what is active, and feed it to the query in one move — and so
 * adding a filter is one field here rather than five edits on the page.
 */
export interface ProductFilterState {
  categoryId: string | null;
  status: ProductStatus | "";
  stock: StockFilter | "";
  onSale: boolean;
  uncategorized: boolean;
  minPrice: string;
  maxPrice: string;
  createdFrom: string;
  createdTo: string;
}

export const EMPTY_PRODUCT_FILTERS: ProductFilterState = {
  categoryId: null,
  status: "",
  stock: "",
  onSale: false,
  uncategorized: false,
  minPrice: "",
  maxPrice: "",
  createdFrom: "",
  createdTo: "",
};

/** How many filters are doing something — drives the badge on the trigger. */
export function countActiveFilters(state: ProductFilterState): number {
  let n = 0;
  if (state.categoryId) n++;
  if (state.status) n++;
  if (state.stock) n++;
  if (state.onSale) n++;
  if (state.uncategorized) n++;
  if (state.minPrice.trim() || state.maxPrice.trim()) n++;
  if (state.createdFrom || state.createdTo) n++;
  return n;
}

/**
 * Translate the form state into API params.
 *
 * Prices are entered in dollars and sent in cents — the boundary is here, once,
 * rather than at the call site of every query.
 */
export function toProductParams(state: ProductFilterState) {
  return {
    categoryId: state.categoryId ?? undefined,
    status: state.status || undefined,
    stock: state.stock || undefined,
    onSale: state.onSale || undefined,
    uncategorized: state.uncategorized || undefined,
    minPrice: priceParam(state.minPrice),
    maxPrice: priceParam(state.maxPrice),
    createdFrom: state.createdFrom
      ? new Date(state.createdFrom).toISOString()
      : undefined,
    // The end of the chosen day, not its midnight: a shopper filtering "up to
    // the 5th" means through the 5th, and an exclusive bound would silently
    // drop everything created that day.
    createdTo: state.createdTo
      ? new Date(`${state.createdTo}T23:59:59.999`).toISOString()
      : undefined,
  };
}

/**
 * Dollars → cents for a query param. dollarsToCents returns null for blank and
 * NaN for garbage; both must become undefined, because sending NaN would make
 * the whole request 400 while the admin is still mid-keystroke.
 */
function priceParam(input: string): number | undefined {
  const cents = dollarsToCents(input);
  return cents == null || Number.isNaN(cents) ? undefined : cents;
}

export function ProductFilters({
  state,
  onChange,
  onClear,
}: {
  state: ProductFilterState;
  onChange: (next: ProductFilterState) => void;
  onClear: () => void;
}) {
  const activeCount = useMemo(() => countActiveFilters(state), [state]);
  const set = <K extends keyof ProductFilterState>(
    key: K,
    value: ProductFilterState[K],
  ) => onChange({ ...state, [key]: value });

  return (
    <AdvancedFilters activeCount={activeCount} onClear={onClear}>
      <Field
        label="Category"
        hint="Includes everything filed underneath it."
        className="sm:col-span-2"
      >
        <CategoryPicker
          label="Filter by category"
          value={state.categoryId}
          // Choosing a category and "uncategorized" at once is contradictory,
          // so picking one clears the other rather than returning nothing.
          onChange={(id) =>
            onChange({
              ...state,
              categoryId: id,
              uncategorized: id ? false : state.uncategorized,
            })
          }
          placeholder="Any category"
          noneLabel="Any category"
        />
      </Field>

      <Field label="Stock level" htmlFor="filter-stock">
        <FilterSelect<StockFilter>
          label="Stock level"
          className="w-full"
          value={state.stock}
          onChange={(v) => set("stock", v)}
          options={[
            { value: "", label: "Any stock level" },
            { value: "in", label: "In stock" },
            { value: "low", label: "Low stock" },
            { value: "out", label: "Out of stock" },
          ]}
        />
      </Field>

      <Field label="Status" htmlFor="filter-status">
        <FilterSelect<ProductStatus>
          label="Status"
          className="w-full"
          value={state.status}
          onChange={(v) => set("status", v)}
          options={[
            { value: "", label: "Any status" },
            { value: "ACTIVE", label: "Active" },
            { value: "DRAFT", label: "Draft" },
            { value: "ARCHIVED", label: "Archived" },
          ]}
        />
      </Field>

      <Field label="Price from" htmlFor="filter-min-price" hint="Dollars.">
        <Input
          id="filter-min-price"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          placeholder="0.00"
          value={state.minPrice}
          onChange={(e) => set("minPrice", e.target.value)}
        />
      </Field>

      <Field label="Price to" htmlFor="filter-max-price" hint="Dollars.">
        <Input
          id="filter-max-price"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          placeholder="No limit"
          value={state.maxPrice}
          onChange={(e) => set("maxPrice", e.target.value)}
        />
      </Field>

      <Field label="Created from" htmlFor="filter-created-from">
        <Input
          id="filter-created-from"
          type="date"
          value={state.createdFrom}
          onChange={(e) => set("createdFrom", e.target.value)}
        />
      </Field>

      <Field label="Created to" htmlFor="filter-created-to">
        <Input
          id="filter-created-to"
          type="date"
          value={state.createdTo}
          onChange={(e) => set("createdTo", e.target.value)}
        />
      </Field>

      <div className="space-y-3 sm:col-span-2 lg:col-span-4">
        <Toggle
          label="On sale only"
          description="Products with a sale price set, scheduled or live."
          checked={state.onSale}
          onChange={(v) => set("onSale", v)}
        />
        <Toggle
          label="Uncategorized only"
          description="Products with no category assigned yet."
          checked={state.uncategorized}
          onChange={(v) =>
            onChange({
              ...state,
              uncategorized: v,
              categoryId: v ? null : state.categoryId,
            })
          }
        />
      </div>
    </AdvancedFilters>
  );
}
