"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import type {
  CouponDetail,
  CouponInput,
  CouponType,
} from "@/lib/api/promotions";
import { useCreateCoupon, useUpdateCoupon } from "@/lib/api/hooks/promotions";
import { ApiError } from "@/lib/api/client";
import { Select } from "@/components/ui/Select";
import { Field, Input, Panel, Textarea, Toggle } from "@/components/ui/Form";
import {
  EMPTY_SCOPE,
  PromotionScopeFields,
  scopeFromRecord,
  scopeIsIncomplete,
  scopeToInput,
  type ScopeState,
} from "./PromotionScopeFields";
import { dollarsToCents, centsToDollars } from "@/lib/format";

type Props =
  | { mode: "create"; coupon?: undefined }
  | { mode: "edit"; coupon: CouponDetail };

/** ISO string → value for a `datetime-local` input (local time, minute precision). */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
export function fromLocalInput(v: string | undefined): string | null {
  return v && v.trim() ? new Date(v).toISOString() : null;
}
export function intOrNull(v: string | undefined): number | null {
  if (!v || !v.trim()) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

interface FormState {
  code: string;
  name: string;
  description: string;
  type: CouponType;
  value: string;
  minOrder: string;
  maxDiscount: string;
  usageLimit: string;
  perCustomerLimit: string;
  startsAt: string;
  expiresAt: string;
  active: boolean;
  isPublic: boolean;
}

function initialState(coupon?: CouponDetail): FormState {
  return {
    code: coupon?.code ?? "",
    name: coupon?.name ?? "",
    description: coupon?.description ?? "",
    type: coupon?.type ?? "PERCENT",
    value:
      coupon == null
        ? ""
        : coupon.type === "FIXED"
          ? centsToDollars(coupon.value)
          : coupon.type === "PERCENT"
            ? String(coupon.value)
            : "",
    minOrder: coupon?.minOrder != null ? centsToDollars(coupon.minOrder) : "",
    maxDiscount:
      coupon?.maxDiscount != null ? centsToDollars(coupon.maxDiscount) : "",
    usageLimit: coupon?.usageLimit != null ? String(coupon.usageLimit) : "",
    perCustomerLimit:
      coupon?.perCustomerLimit != null ? String(coupon.perCustomerLimit) : "",
    startsAt: toLocalInput(coupon?.startsAt ?? null),
    expiresAt: toLocalInput(coupon?.expiresAt ?? null),
    active: coupon?.active ?? true,
    isPublic: coupon?.isPublic ?? false,
  };
}

/**
 * Coupon editor.
 *
 * Three things are new beyond the original code/type/value/limits form:
 *
 *   * SCOPE — a coupon can now be restricted to categories or products, which
 *     is what "20% off audio" actually requires; the discount is then computed
 *     on the eligible lines rather than the whole cart.
 *   * IDENTITY — a name and a shopper-facing description, because a store
 *     running generated batches cannot be operated off codes alone.
 *   * PUBLICATION — an explicit opt-in before a code is advertised on the
 *     storefront's offers strip. Off by default: a code mailed to a win-back
 *     segment must not become public merely because it is active.
 */
export function CouponForm({ mode, coupon }: Props) {
  const router = useRouter();
  const create = useCreateCoupon();
  const update = useUpdateCoupon(coupon?.id ?? "");
  const [state, setState] = useState<FormState>(() => initialState(coupon));
  const [scope, setScope] = useState<ScopeState>(() =>
    coupon ? scopeFromRecord(coupon) : EMPTY_SCOPE,
  );
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const isPercent = state.type === "PERCENT";
  const isFixed = state.type === "FIXED";
  const isFreeShip = state.type === "FREE_SHIPPING";
  const saving = create.isPending || update.isPending;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const code = state.code.trim().toUpperCase();
    if (code.length < 2) {
      setFormError("A coupon needs a code of at least 2 characters.");
      return;
    }
    if (scopeIsIncomplete(scope)) {
      setFormError(
        scope.scope === "CATEGORY"
          ? "Choose at least one category, or set the scope back to Everything."
          : "Choose at least one product, or set the scope back to Everything.",
      );
      return;
    }

    let value = 0;
    if (isFixed) value = dollarsToCents(state.value) ?? 0;
    else if (isPercent) value = intOrNull(state.value) ?? 0;
    if (Number.isNaN(value)) {
      setFormError("Enter a valid amount.");
      return;
    }
    if (isPercent && (value < 1 || value > 100)) {
      setFormError("Percentage must be between 1 and 100.");
      return;
    }
    if (isFixed && value <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }

    const input: CouponInput = {
      code,
      name: state.name.trim() || null,
      description: state.description.trim() || null,
      type: state.type,
      value,
      minOrder: state.minOrder.trim() ? dollarsToCents(state.minOrder) : null,
      maxDiscount:
        isPercent && state.maxDiscount.trim()
          ? dollarsToCents(state.maxDiscount)
          : null,
      usageLimit: intOrNull(state.usageLimit),
      perCustomerLimit: intOrNull(state.perCustomerLimit),
      startsAt: fromLocalInput(state.startsAt),
      expiresAt: fromLocalInput(state.expiresAt),
      active: state.active,
      isPublic: state.isPublic,
      ...scopeToInput(scope),
    };

    try {
      if (mode === "create") await create.mutateAsync(input);
      else await update.mutateAsync(input);
      router.push("/coupons");
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong.",
      );
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Panel title="The code">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" htmlFor="coupon-code" required>
            <Input
              id="coupon-code"
              value={state.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="SUMMER20"
              autoCapitalize="characters"
              className="font-mono uppercase"
            />
          </Field>

          <Field
            label="Internal name"
            htmlFor="coupon-name"
            hint="For your own reference in the coupon list."
          >
            <Input
              id="coupon-name"
              value={state.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Summer sale — audio"
            />
          </Field>

          <Field label="Discount type" className="sm:col-span-2">
            <Select<CouponType>
              label="Discount type"
              value={state.type}
              onChange={(type) => set("type", type)}
              options={[
                {
                  value: "PERCENT",
                  label: "Percentage off",
                  description: "A share of the eligible subtotal",
                },
                {
                  value: "FIXED",
                  label: "Fixed amount off",
                  description: "A flat sum, capped at the eligible subtotal",
                },
                {
                  value: "FREE_SHIPPING",
                  label: "Free shipping",
                  description: "Waives the shipping fee at checkout",
                },
              ]}
            />
          </Field>

          {!isFreeShip && (
            <>
              <Field
                label={isPercent ? "Percentage off" : "Amount off"}
                htmlFor="coupon-value"
                required
                hint={isPercent ? "1–100." : "In dollars."}
              >
                <Input
                  id="coupon-value"
                  value={state.value}
                  onChange={(e) => set("value", e.target.value)}
                  inputMode="decimal"
                  placeholder={isPercent ? "20" : "10.00"}
                />
              </Field>
              {isPercent && (
                <Field
                  label="Maximum discount"
                  htmlFor="coupon-max"
                  hint="Caps what a percentage coupon can take off. Optional."
                >
                  <Input
                    id="coupon-max"
                    value={state.maxDiscount}
                    onChange={(e) => set("maxDiscount", e.target.value)}
                    inputMode="decimal"
                    placeholder="No cap"
                  />
                </Field>
              )}
            </>
          )}
        </div>
      </Panel>

      <Panel
        title="What it applies to"
        description="Restrict the coupon to part of the catalog. The discount is then calculated on those lines only."
      >
        <PromotionScopeFields
          state={scope}
          onChange={setScope}
          subject="coupon"
        />
      </Panel>

      <Panel title="Limits and schedule">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Minimum order"
            htmlFor="coupon-min"
            hint="Measured against the whole cart."
          >
            <Input
              id="coupon-min"
              value={state.minOrder}
              onChange={(e) => set("minOrder", e.target.value)}
              inputMode="decimal"
              placeholder="No minimum"
            />
          </Field>
          <Field label="Total uses" htmlFor="coupon-uses">
            <Input
              id="coupon-uses"
              value={state.usageLimit}
              onChange={(e) => set("usageLimit", e.target.value)}
              inputMode="numeric"
              placeholder="Unlimited"
            />
          </Field>
          <Field
            label="Uses per customer"
            htmlFor="coupon-per-customer"
            hint="Only enforceable for signed-in shoppers."
          >
            <Input
              id="coupon-per-customer"
              value={state.perCustomerLimit}
              onChange={(e) => set("perCustomerLimit", e.target.value)}
              inputMode="numeric"
              placeholder="Unlimited"
            />
          </Field>

          <Field label="Starts" htmlFor="coupon-starts">
            <Input
              id="coupon-starts"
              type="datetime-local"
              value={state.startsAt}
              onChange={(e) => set("startsAt", e.target.value)}
            />
          </Field>
          <Field label="Expires" htmlFor="coupon-expires">
            <Input
              id="coupon-expires"
              type="datetime-local"
              value={state.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Visibility">
        <div className="space-y-4">
          <Toggle
            label="Active"
            description="Inactive coupons are rejected at checkout regardless of their dates."
            checked={state.active}
            onChange={(v) => set("active", v)}
          />
          <Toggle
            label="Advertise on the storefront"
            description="Shows this code in the shopper-facing offers list, one click to apply."
            checked={state.isPublic}
            onChange={(v) => set("isPublic", v)}
          />
          {state.isPublic && (
            <Field
              label="Shopper-facing description"
              htmlFor="coupon-description"
              hint="Shown next to the code on the offers strip."
            >
              <Textarea
                id="coupon-description"
                rows={2}
                value={state.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="20% off all audio this week."
              />
            </Field>
          )}
        </div>
      </Panel>

      {formError && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          {mode === "create" ? "Create coupon" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/coupons")}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
