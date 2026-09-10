"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Loader2, Percent, Tags, Undo2 } from "lucide-react";
import type { BulkSaleInput } from "@/lib/api/promotions";
import { useBulkSale, usePreviewBulkSale } from "@/lib/api/hooks/promotions";
import { ApiError } from "@/lib/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Panel, SegmentedControl } from "@/components/ui/Form";
import {
  EMPTY_SCOPE,
  PromotionScopeFields,
  scopeIsIncomplete,
  scopeToInput,
  type ScopeState,
} from "./PromotionScopeFields";

type Mode = "percent" | "clear";

function fromLocalInput(v: string): string | null {
  return v.trim() ? new Date(v).toISOString() : null;
}

/**
 * Run one sale across a scope.
 *
 * Sales were per-product: to run "20% off laptops for the weekend" a merchant
 * opened every laptop and filled the same form. This applies the same schedule
 * to everything a scope matches, in one call — the same ALL / CATEGORY /
 * PRODUCT vocabulary coupons and automatic discounts use.
 *
 * Two things make it safe to use on a whole catalog. The COUNT is fetched live
 * from the same scope the button will act on, so the confirm step says "34
 * products, 91 variants" rather than asking for faith. And ending a sale is its
 * own explicit mode, not an empty form — a destructive action should be chosen,
 * never inferred from blank inputs.
 */
export function BulkSalePanel() {
  const bulkSale = useBulkSale();
  const [mode, setMode] = useState<Mode>("percent");
  const [scope, setScope] = useState<ScopeState>(EMPTY_SCOPE);
  const [percentOff, setPercentOff] = useState("20");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const incomplete = scopeIsIncomplete(scope);

  // The preview asks the same question the apply will: how much does this scope
  // match? Sent without the sale fields, since only the targeting matters.
  const previewInput = useMemo<BulkSaleInput>(
    () => scopeToInput(scope),
    [scope],
  );
  const { data: preview, isFetching: previewing } = usePreviewBulkSale(
    previewInput,
    !incomplete,
  );

  const percent = parseInt(percentOff, 10);
  const percentValid =
    mode === "clear" || (Number.isFinite(percent) && percent >= 1 && percent <= 99);

  const run = async () => {
    setError(null);
    setResult(null);
    const input: BulkSaleInput = {
      ...scopeToInput(scope),
      ...(mode === "clear"
        ? { clear: true }
        : {
            percentOff: percent,
            saleStartsAt: fromLocalInput(startsAt),
            saleEndsAt: fromLocalInput(endsAt),
          }),
    };
    try {
      const res = await bulkSale.mutateAsync(input);
      setResult(
        res.cleared
          ? `Sale ended on ${res.productsUpdated} product${res.productsUpdated === 1 ? "" : "s"} (${res.variantsUpdated} variants).`
          : `${percent}% off applied to ${res.productsUpdated} product${res.productsUpdated === 1 ? "" : "s"} (${res.variantsUpdated} variants).`,
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not run the sale.",
      );
    } finally {
      setConfirmOpen(false);
    }
  };

  const scopeLabel =
    scope.scope === "ALL"
      ? "every active product"
      : scope.scope === "CATEGORY"
        ? `${scope.categoryIds.length} categor${scope.categoryIds.length === 1 ? "y" : "ies"} (and everything under them)`
        : `${scope.productIds.length} product${scope.productIds.length === 1 ? "" : "s"}`;

  return (
    <Panel
      title="Run a sale"
      description="Apply one schedule across the catalog, a category, or a hand-picked set."
    >
      <div className="space-y-5">
        <SegmentedControl<Mode>
          label="Sale action"
          value={mode}
          onChange={setMode}
          options={[
            {
              value: "percent",
              label: "Start a sale",
              icon: <Percent className="h-4 w-4" aria-hidden />,
            },
            {
              value: "clear",
              label: "End a sale",
              icon: <Undo2 className="h-4 w-4" aria-hidden />,
            },
          ]}
        />

        <PromotionScopeFields
          state={scope}
          onChange={setScope}
          subject="sale"
          // A sale IS the sale price, so "exclude items already on sale" is a
          // question with no meaning here — it would only ever mean "skip the
          // products you are trying to re-price".
          showSaleItemsToggle={false}
        />

        {mode === "percent" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Percentage off"
              htmlFor="bulk-percent"
              required
              hint="Each variant is discounted from its own regular price."
              error={
                percentValid ? null : "Enter a percentage between 1 and 99."
              }
            >
              <Input
                id="bulk-percent"
                type="number"
                min={1}
                max={99}
                value={percentOff}
                onChange={(e) => setPercentOff(e.target.value)}
              />
            </Field>
            <Field
              label="Starts"
              htmlFor="bulk-starts"
              hint="Leave blank to start now."
            >
              <Input
                id="bulk-starts"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </Field>
            <Field
              label="Ends"
              htmlFor="bulk-ends"
              hint="Leave blank to run until you end it."
            >
              <Input
                id="bulk-ends"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </Field>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Tags className="h-4 w-4" aria-hidden />
            {incomplete ? (
              <>Choose what this applies to.</>
            ) : previewing ? (
              <>Counting…</>
            ) : preview ? (
              <>
                Will affect{" "}
                <strong className="text-foreground">
                  {preview.products} product{preview.products === 1 ? "" : "s"}
                </strong>{" "}
                ({preview.variants} variant
                {preview.variants === 1 ? "" : "s"})
              </>
            ) : (
              <>Ready.</>
            )}
          </p>
          <button
            type="button"
            disabled={
              incomplete ||
              !percentValid ||
              bulkSale.isPending ||
              preview?.variants === 0
            }
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {bulkSale.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <CalendarClock className="h-4 w-4" aria-hidden />
            )}
            {mode === "clear" ? "End sale" : "Apply sale"}
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {result && (
          <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            {result}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={mode === "clear" ? "End this sale?" : "Apply this sale?"}
        tone={mode === "clear" ? "danger" : "primary"}
        confirmLabel={mode === "clear" ? "End sale" : "Apply sale"}
        loading={bulkSale.isPending}
        description={
          <div className="space-y-2">
            <p>
              {mode === "clear" ? (
                <>
                  Sale pricing will be removed from {scopeLabel} — that is{" "}
                  <strong>{preview?.products ?? 0}</strong> product
                  {preview?.products === 1 ? "" : "s"}.
                </>
              ) : (
                <>
                  <strong>{percent}% off</strong> will be applied to{" "}
                  {scopeLabel} — that is{" "}
                  <strong>{preview?.products ?? 0}</strong> product
                  {preview?.products === 1 ? "" : "s"} and{" "}
                  <strong>{preview?.variants ?? 0}</strong> variant
                  {preview?.variants === 1 ? "" : "s"}.
                </>
              )}
            </p>
            <p>
              This overwrites any sale price those variants already have. It is
              recorded in the audit log.
            </p>
          </div>
        }
        onConfirm={run}
        onCancel={() => setConfirmOpen(false)}
      />
    </Panel>
  );
}
