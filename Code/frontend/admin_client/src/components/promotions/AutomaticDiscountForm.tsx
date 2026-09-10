"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import type {
  AutomaticDiscountDetail,
  AutomaticDiscountInput,
  DiscountStatus,
} from "@/lib/api/promotions";
import {
  useCreateAutomaticDiscount,
  useUpdateAutomaticDiscount,
} from "@/lib/api/hooks/promotions";
import { ApiError } from "@/lib/api/client";
import { Select } from "@/components/ui/Select";
import { Field, Input, Panel, Textarea } from "@/components/ui/Form";
import {
  EMPTY_SCOPE,
  PromotionScopeFields,
  scopeFromRecord,
  scopeIsIncomplete,
  scopeToInput,
  type ScopeState,
} from "./PromotionScopeFields";
import { dollarsToCents, centsToDollars } from "@/lib/format";

type EffectType = "PERCENT" | "AMOUNT" | "FREE_SHIPPING";

function intOrUndef(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}
function fromLocalInput(v: string): string | null {
  return v.trim() ? new Date(v).toISOString() : null;
}
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

interface FormState {
  name: string;
  description: string;
  minSubtotal: string;
  minQty: string;
  effectType: EffectType;
  effectValue: string;
  priority: string;
  status: DiscountStatus;
  startsAt: string;
  endsAt: string;
}

function initialState(discount?: AutomaticDiscountDetail): FormState {
  const rule = discount?.rule;
  return {
    name: discount?.name ?? "",
    description: discount?.description ?? "",
    minSubtotal:
      rule?.minSubtotal != null ? centsToDollars(rule.minSubtotal) : "",
    minQty: rule?.minQty != null ? String(rule.minQty) : "",
    effectType: rule?.percentOff
      ? "PERCENT"
      : rule?.amountOff
        ? "AMOUNT"
        : rule?.freeShipping
          ? "FREE_SHIPPING"
          : "PERCENT",
    effectValue: rule?.percentOff
      ? String(rule.percentOff)
      : rule?.amountOff
        ? centsToDollars(rule.amountOff)
        : "",
    priority: discount?.priority != null ? String(discount.priority) : "0",
    status: discount?.status ?? "ACTIVE",
    startsAt: toLocalInput(discount?.startsAt ?? null),
    endsAt: toLocalInput(discount?.endsAt ?? null),
  };
}

/**
 * Automatic (no-code) discount editor.
 *
 * An automatic discount is a coupon without a code, so it now takes the same
 * scope control — which is what makes "10% off all laptops this weekend"
 * expressible without a code at all.
 *
 * The gates and the scope answer different questions and are deliberately kept
 * apart in the layout: `minSubtotal` / `minQty` are measured against the WHOLE
 * cart ("spend $50"), while the scope decides which lines the discount is then
 * calculated on. Conflating them is the classic promotions bug.
 */
export function AutomaticDiscountForm({
  discount,
  onDone,
}: {
  discount?: AutomaticDiscountDetail;
  onDone: () => void;
}) {
  const create = useCreateAutomaticDiscount();
  const update = useUpdateAutomaticDiscount();
  const [state, setState] = useState<FormState>(() => initialState(discount));
  const [scope, setScope] = useState<ScopeState>(() =>
    discount ? scopeFromRecord(discount) : EMPTY_SCOPE,
  );
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const saving = create.isPending || update.isPending;
  const isFreeShipping = state.effectType === "FREE_SHIPPING";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (state.name.trim().length < 2) {
      setFormError("Give the discount a name.");
      return;
    }
    if (scopeIsIncomplete(scope)) {
      setFormError("Pick the categories or products this discount applies to.");
      return;
    }

    const rule: AutomaticDiscountInput["rule"] = {};
    const minSub = state.minSubtotal.trim()
      ? dollarsToCents(state.minSubtotal)
      : null;
    if (minSub != null && Number.isFinite(minSub)) rule.minSubtotal = minSub;
    const minQty = intOrUndef(state.minQty);
    if (minQty != null) rule.minQty = minQty;

    if (state.effectType === "PERCENT") {
      const percent = intOrUndef(state.effectValue) ?? 0;
      if (percent < 1 || percent > 100) {
        setFormError("Percentage must be between 1 and 100.");
        return;
      }
      rule.percentOff = percent;
    } else if (state.effectType === "AMOUNT") {
      const amount = dollarsToCents(state.effectValue);
      if (amount == null || Number.isNaN(amount) || amount <= 0) {
        setFormError("Enter an amount greater than zero.");
        return;
      }
      rule.amountOff = amount;
    } else {
      rule.freeShipping = true;
    }

    const input: AutomaticDiscountInput = {
      name: state.name.trim(),
      description: state.description.trim() || null,
      rule,
      priority: intOrUndef(state.priority) ?? 0,
      status: state.status,
      startsAt: fromLocalInput(state.startsAt),
      endsAt: fromLocalInput(state.endsAt),
      ...scopeToInput(scope),
    };

    try {
      if (discount) await update.mutateAsync({ id: discount.id, input });
      else await create.mutateAsync(input);
      onDone();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong.",
      );
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Panel title={discount ? "Edit discount" : "New automatic discount"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="ad-name" required className="sm:col-span-2">
            <Input
              id="ad-name"
              value={state.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Buy 3, get 10% off"
              autoFocus
            />
          </Field>

          <Field
            label="Description"
            htmlFor="ad-description"
            hint="Optional note for your own reference."
            className="sm:col-span-2"
          >
            <Textarea
              id="ad-description"
              rows={2}
              value={state.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
        </div>
      </Panel>

      <Panel
        title="When it applies"
        description="Both gates are measured against the whole cart, whatever the scope below."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Minimum cart subtotal"
            htmlFor="ad-min-subtotal"
            hint="In dollars. Leave blank for no minimum."
          >
            <Input
              id="ad-min-subtotal"
              value={state.minSubtotal}
              onChange={(e) => set("minSubtotal", e.target.value)}
              inputMode="decimal"
              placeholder="None"
            />
          </Field>
          <Field
            label="Minimum item count"
            htmlFor="ad-min-qty"
            hint='The "buy 3" half of a "buy 3, get 10% off" rule.'
          >
            <Input
              id="ad-min-qty"
              value={state.minQty}
              onChange={(e) => set("minQty", e.target.value)}
              inputMode="numeric"
              placeholder="None"
            />
          </Field>
        </div>
      </Panel>

      <Panel title="What it takes off">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Discount type">
            <Select<EffectType>
              label="Discount type"
              value={state.effectType}
              onChange={(v) => set("effectType", v)}
              options={[
                { value: "PERCENT", label: "Percentage off" },
                { value: "AMOUNT", label: "Fixed amount off" },
                { value: "FREE_SHIPPING", label: "Free shipping" },
              ]}
            />
          </Field>
          {!isFreeShipping && (
            <Field
              label={
                state.effectType === "PERCENT" ? "Percentage" : "Amount"
              }
              htmlFor="ad-effect-value"
              required
            >
              <Input
                id="ad-effect-value"
                value={state.effectValue}
                onChange={(e) => set("effectValue", e.target.value)}
                inputMode="decimal"
                placeholder={state.effectType === "PERCENT" ? "10" : "5.00"}
              />
            </Field>
          )}
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <PromotionScopeFields
            state={scope}
            onChange={setScope}
            subject="discount"
          />
        </div>
      </Panel>

      <Panel title="Precedence and schedule">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Priority"
            htmlFor="ad-priority"
            hint="Higher wins. Only one automatic discount applies to a cart."
          >
            <Input
              id="ad-priority"
              value={state.priority}
              onChange={(e) => set("priority", e.target.value)}
              inputMode="numeric"
              placeholder="0"
            />
          </Field>
          <Field label="Status">
            <Select<DiscountStatus>
              label="Status"
              value={state.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "SCHEDULED", label: "Scheduled" },
                { value: "DISABLED", label: "Disabled" },
              ]}
            />
          </Field>
          <Field label="Starts" htmlFor="ad-starts">
            <Input
              id="ad-starts"
              type="datetime-local"
              value={state.startsAt}
              onChange={(e) => set("startsAt", e.target.value)}
            />
          </Field>
          <Field label="Ends" htmlFor="ad-ends">
            <Input
              id="ad-ends"
              type="datetime-local"
              value={state.endsAt}
              onChange={(e) => set("endsAt", e.target.value)}
            />
          </Field>
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
          {discount ? "Save changes" : "Create discount"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
