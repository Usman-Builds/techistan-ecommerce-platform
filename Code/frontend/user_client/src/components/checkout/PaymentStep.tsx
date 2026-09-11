"use client";

import { useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { getStripe } from "@/lib/stripe";
import { formatMoney } from "@/lib/utils/money";

/**
 * Checkout step 3 — payment (FR-410). Renders the Stripe Payment Element inside
 * <Elements>, card only: the backend creates the PaymentIntent with just `card`,
 * and the Apple Pay / Google Pay buttons are switched off below. Card data is
 * entered directly into Stripe's iframe and sent to Stripe — it never touches our
 * server (NFR-207). On success we hand off to the confirmation page, which polls
 * the order until the server confirms it (the redirect alone is not trusted).
 */
export function PaymentStep({
  clientSecret,
  orderId,
  amountCents,
  currency,
  onBack,
  onPaid,
}: {
  clientSecret: string | null;
  orderId: string;
  amountCents: number;
  currency: string;
  onBack: () => void;
  onPaid: () => void;
}) {
  const stripePromise = getStripe();

  if (!stripePromise || !clientSecret) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-warning"
            aria-hidden
          />
          <div>
            <p className="font-medium">Payments are not configured</p>
            <p className="text-muted-foreground">
              Set <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> (client) and{" "}
              <code>STRIPE_SECRET_KEY</code> (server) to enable card payment. Your
              order <span className="font-medium">has been created</span> and is
              awaiting payment.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-border px-4 py-3 text-sm font-medium hover:bg-muted"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret, appearance: { theme: "stripe" } }}
    >
      <PaymentForm
        orderId={orderId}
        amountCents={amountCents}
        currency={currency}
        onBack={onBack}
        onPaid={onPaid}
      />
    </Elements>
  );
}

function PaymentForm({
  orderId,
  amountCents,
  currency,
  onBack,
  onPaid,
}: {
  orderId: string;
  amountCents: number;
  currency: string;
  onBack: () => void;
  onPaid: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Only used if Stripe has to redirect, which is rare for cards (3-D
        // Secure normally opens in a modal). The page then polls the order.
        return_url: `${window.location.origin}/checkout/confirmation?orderId=${orderId}`,
      },
      redirect: "if_required",
    });

    if (stripeError) {
      setError(stripeError.message ?? "Payment could not be completed.");
      setSubmitting(false);
      return;
    }

    if (
      paymentIntent &&
      (paymentIntent.status === "succeeded" ||
        paymentIntent.status === "processing")
    ) {
      onPaid(); // hand off to confirmation (the server is the source of truth)
      return;
    }

    setError("Payment did not complete. Please try again.");
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement
        options={{
          // Wallets are card-backed, so Stripe would still offer them on a
          // card-only PaymentIntent. Card only means the card form alone.
          wallets: { applePay: "never", googlePay: "never" },
        }}
      />

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="rounded-md border border-border px-4 py-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Lock className="h-4 w-4" aria-hidden />
          )}
          Pay {formatMoney(amountCents, currency)}
        </button>
      </div>
    </form>
  );
}
