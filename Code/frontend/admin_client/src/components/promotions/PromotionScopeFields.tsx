"use client";

import { Globe, FolderTree, Package } from "lucide-react";
import type { PromotionScope } from "@/lib/api/promotions";
import { CategoryMultiPicker } from "@/components/ui/CategoryPicker";
import { ProductPicker } from "@/components/ui/ProductPicker";
import { Field, SegmentedControl, Toggle } from "@/components/ui/Form";

/** The scope half of a promotion form, as form state. */
export interface ScopeState {
  scope: PromotionScope;
  categoryIds: string[];
  productIds: string[];
  appliesToSaleItems: boolean;
}

export const EMPTY_SCOPE: ScopeState = {
  scope: "ALL",
  categoryIds: [],
  productIds: [],
  appliesToSaleItems: true,
};

/** Read the scope back out of an API record (coupon or automatic discount). */
export function scopeFromRecord(record: {
  scope: PromotionScope;
  appliesToSaleItems: boolean;
  categories?: { categoryId: string }[];
  products?: { productId: string }[];
}): ScopeState {
  return {
    scope: record.scope,
    categoryIds: (record.categories ?? []).map((c) => c.categoryId),
    productIds: (record.products ?? []).map((p) => p.productId),
    appliesToSaleItems: record.appliesToSaleItems,
  };
}

/**
 * Turn form state into the API payload.
 *
 * Only the target list the chosen scope actually uses is sent. Sending both
 * would leave stale category targets attached to a product-scoped coupon —
 * invisible in the UI, and live again the moment someone flips the scope back.
 */
export function scopeToInput(state: ScopeState) {
  return {
    scope: state.scope,
    appliesToSaleItems: state.appliesToSaleItems,
    categoryIds: state.scope === "CATEGORY" ? state.categoryIds : [],
    productIds: state.scope === "PRODUCT" ? state.productIds : [],
  };
}

/** True when the chosen scope has no targets — the API would reject this. */
export function scopeIsIncomplete(state: ScopeState): boolean {
  if (state.scope === "CATEGORY") return state.categoryIds.length === 0;
  if (state.scope === "PRODUCT") return state.productIds.length === 0;
  return false;
}

/**
 * "What does this apply to?" — shared by coupons, automatic discounts and bulk
 * sales.
 *
 * The three used to be all-or-nothing: a coupon discounted the entire cart, and
 * a sale was set one product at a time. Making them share one control means a
 * merchant learns the idea once, and a category rule means the same thing
 * (subtree included) everywhere.
 *
 * A segmented control rather than a dropdown, because the choice between "the
 * whole catalog" and "these nine products" is a decision worth keeping visible
 * while you make it.
 */
export function PromotionScopeFields({
  state,
  onChange,
  subject = "discount",
  showSaleItemsToggle = true,
  disabled,
}: {
  state: ScopeState;
  onChange: (next: ScopeState) => void;
  /** Noun used in the helper copy: "coupon", "discount", "sale". */
  subject?: string;
  showSaleItemsToggle?: boolean;
  disabled?: boolean;
}) {
  const set = <K extends keyof ScopeState>(key: K, value: ScopeState[K]) =>
    onChange({ ...state, [key]: value });

  return (
    <div className="space-y-4">
      <Field
        label="Applies to"
        hint={
          state.scope === "ALL"
            ? `This ${subject} applies to everything in the cart.`
            : state.scope === "CATEGORY"
              ? `Only lines in the chosen categories — and everything filed underneath them — are discounted.`
              : `Only the chosen products are discounted. Everything else pays full price.`
        }
      >
        <SegmentedControl<PromotionScope>
          label="Promotion scope"
          value={state.scope}
          onChange={(scope) => set("scope", scope)}
          disabled={disabled}
          options={[
            {
              value: "ALL",
              label: "Everything",
              icon: <Globe className="h-4 w-4" aria-hidden />,
            },
            {
              value: "CATEGORY",
              label: "Categories",
              icon: <FolderTree className="h-4 w-4" aria-hidden />,
            },
            {
              value: "PRODUCT",
              label: "Products",
              icon: <Package className="h-4 w-4" aria-hidden />,
            },
          ]}
        />
      </Field>

      {state.scope === "CATEGORY" && (
        <Field
          label="Categories"
          required
          error={
            state.categoryIds.length === 0
              ? "Choose at least one category."
              : null
          }
          hint="Sub-categories are included automatically."
        >
          <CategoryMultiPicker
            label="Categories this applies to"
            values={state.categoryIds}
            onChange={(ids) => set("categoryIds", ids)}
            disabled={disabled}
            max={200}
          />
        </Field>
      )}

      {state.scope === "PRODUCT" && (
        <Field
          label="Products"
          required
          error={
            state.productIds.length === 0 ? "Choose at least one product." : null
          }
        >
          <ProductPicker
            label="Products this applies to"
            values={state.productIds}
            onChange={(ids) => set("productIds", ids)}
            disabled={disabled}
            max={200}
          />
        </Field>
      )}

      {showSaleItemsToggle && (
        <Toggle
          label="Include items already on sale"
          description={
            state.appliesToSaleItems
              ? "Sale-priced lines are discounted as well."
              : "Sale-priced lines are excluded — the usual no-double-discounting rule."
          }
          checked={state.appliesToSaleItems}
          onChange={(v) => set("appliesToSaleItems", v)}
          disabled={disabled}
        />
      )}
    </div>
  );
}

/** Compact "Everything / 3 categories / 9 products" summary for list rows. */
export function ScopeSummary({
  scope,
  counts,
}: {
  scope: PromotionScope;
  counts?: { products: number; categories: number };
}) {
  if (scope === "ALL") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Globe className="h-3.5 w-3.5" aria-hidden />
        Everything
      </span>
    );
  }
  if (scope === "CATEGORY") {
    const n = counts?.categories ?? 0;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <FolderTree className="h-3.5 w-3.5" aria-hidden />
        {n} categor{n === 1 ? "y" : "ies"}
      </span>
    );
  }
  const n = counts?.products ?? 0;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Package className="h-3.5 w-3.5" aria-hidden />
      {n} product{n === 1 ? "" : "s"}
    </span>
  );
}
