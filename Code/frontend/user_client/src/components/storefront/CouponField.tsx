"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Tag, TicketPercent, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { listOffers, type PublicOffer } from "@/lib/api/promotions";
import { useApplyCoupon, useRemoveCoupon } from "@/lib/api/hooks/cart";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Apply, show or remove the cart's coupon.
 *
 * Extracted from the cart page so the SAME control can appear wherever a
 * shopper is looking at a total — the cart page, the cart drawer, and the
 * checkout summary. Previously it existed only on `/cart`, which meant a
 * shopper who went straight from the drawer to checkout had no way to enter a
 * code at all: the one screen carrying the field was the one they skipped.
 *
 * The cart is the single source of truth for the applied code, so this holds no
 * state beyond the text being typed; applying refetches the cart and the
 * component re-renders from it.
 */
export function CouponField({
  appliedCode,
  invalidMessage,
  showOffers = true,
  className,
}: {
  appliedCode: string | null;
  invalidMessage?: string | null;
  /** Hide the advertised-offers list where space is tight (the drawer). */
  showOffers?: boolean;
  className?: string;
}) {
  const [code, setCode] = useState("");
  const apply = useApplyCoupon();
  const remove = useRemoveCoupon();

  if (appliedCode) {
    return (
      <div
        className={cn(
          "flex items-center justify-between rounded-md border border-success/40 bg-success/5 px-3 py-2 text-sm",
          className,
        )}
      >
        <span className="inline-flex items-center gap-2 font-medium text-success">
          <Tag className="h-4 w-4" aria-hidden /> {appliedCode} applied
        </span>
        <button
          type="button"
          aria-label="Remove coupon"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  // The server's rejection is the useful message ("only applies to certain
  // categories", "spend at least $50"), so it wins over the stored-code notice.
  const errorMessage =
    (apply.error instanceof ApiError ? apply.error.message : null) ??
    invalidMessage ??
    null;

  return (
    <div className={cn("space-y-2", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = code.trim();
          if (trimmed) apply.mutate(trimmed);
        }}
        className="space-y-1"
      >
        <label
          htmlFor="coupon-code"
          className="text-xs font-medium text-muted-foreground"
        >
          Coupon code
        </label>
        <div className="flex gap-2">
          <input
            id="coupon-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter code"
            autoCapitalize="characters"
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={apply.isPending || !code.trim()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {apply.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            )}
            Apply
          </button>
        </div>
        {errorMessage && (
          <p className="text-xs text-destructive" role="alert">
            {errorMessage}
          </p>
        )}
      </form>

      {showOffers && (
        <OfferList
          onPick={(offer) => {
            setCode(offer.code);
            apply.mutate(offer.code);
          }}
          pending={apply.isPending}
        />
      )}
    </div>
  );
}

/**
 * The codes the merchant chose to advertise, one click to apply.
 *
 * A discount nobody can find is not a discount. Every other surface here
 * assumes the shopper already knows a code — this is the one that tells them
 * one exists, which is the difference between running a promotion and having
 * one configured.
 *
 * Renders nothing when there is nothing to advertise, so a store that never
 * marks a coupon public sees no empty box.
 */
function OfferList({
  onPick,
  pending,
}: {
  onPick: (offer: PublicOffer) => void;
  pending: boolean;
}) {
  const { data: offers } = useQuery({
    queryKey: ["offers"],
    queryFn: listOffers,
    // Advertised offers change on a merchant's timescale, not a shopper's.
    staleTime: 5 * 60_000,
  });

  if (!offers || offers.length === 0) return null;

  return (
    <div className="space-y-1.5 rounded-md border border-border bg-muted/40 p-2.5">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <TicketPercent className="h-3.5 w-3.5 text-primary" aria-hidden />
        Available offers
      </p>
      <ul className="space-y-1.5">
        {offers.map((offer) => (
          <li key={offer.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => onPick(offer)}
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-background disabled:opacity-50"
            >
              <span className="rounded border border-dashed border-primary/50 bg-background px-1.5 py-0.5 font-mono text-xs font-bold text-primary">
                {offer.code}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium">
                  {offerHeadline(offer)}
                </span>
                {offer.description && (
                  <span className="block text-xs text-muted-foreground">
                    {offer.description}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "20% off", "$10 off", "Free shipping" — plus the spend gate when there is one. */
function offerHeadline(offer: PublicOffer): string {
  const effect =
    offer.type === "PERCENT"
      ? `${offer.value}% off`
      : offer.type === "FIXED"
        ? `${formatCents(offer.value)} off`
        : "Free shipping";
  const scope =
    offer.scope === "CATEGORY"
      ? " selected categories"
      : offer.scope === "PRODUCT"
        ? " selected products"
        : "";
  const gate =
    offer.minOrder != null ? ` over ${formatCents(offer.minOrder)}` : "";
  return `${effect}${scope}${gate}`;
}
