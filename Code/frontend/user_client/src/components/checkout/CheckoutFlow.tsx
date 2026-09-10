"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics/track";
import { Loader2, ShoppingBag } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useCart } from "@/lib/api/hooks/cart";
import { useCreateOrder } from "@/lib/api/hooks/orders";
import type { Order, OrderAddress } from "@/lib/api/orders";
import { CheckoutSteps, type CheckoutStep } from "./CheckoutSteps";
import { OrderSummarySidebar } from "./OrderSummarySidebar";
import { ShippingStep, type ShippingSubmit } from "./ShippingStep";
import { ReviewStep } from "./ReviewStep";
import { PaymentStep } from "./PaymentStep";

function newKey(): string {
  // Stable per checkout attempt; the backend dedupes on it (FR-406).
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Multi-step checkout orchestrator (script 10, FR-401). Shipping → Review →
 * Payment, with a persistent order-summary sidebar. The order (and its Stripe
 * client secret) is created when the shipping step is submitted, so the Review
 * step shows the SERVER-computed totals. Re-submitting an unchanged address
 * reuses the same order + idempotency key; changing it starts a fresh attempt.
 */
export function CheckoutFlow() {
  const router = useRouter();
  const { data: cart, isPending: cartLoading } = useCart();
  const createOrder = useCreateOrder();

  const [step, setStep] = useState<CheckoutStep>("shipping");
  const [order, setOrder] = useState<Order | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<OrderAddress | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => newKey());
  const [lastSubmission, setLastSubmission] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fire begin_checkout once, when the flow first has a non-empty cart (NFR-705).
  const beganRef = useRef(false);
  useEffect(() => {
    if (!beganRef.current && cart && cart.items.length > 0) {
      beganRef.current = true;
      track("begin_checkout", { items: cart.items.length });
    }
  }, [cart]);

  async function handleShipping(data: ShippingSubmit) {
    setError(null);
    setEmail(data.email);
    setAddress(data.address);

    const signature = JSON.stringify({ email: data.email, address: data.address });

    // Unchanged address + existing order → reuse; no duplicate order created.
    if (order && signature === lastSubmission) {
      setStep("review");
      return;
    }

    // A changed address starts a fresh attempt (new idempotency key).
    const key = order ? newKey() : idempotencyKey;
    setIdempotencyKey(key);

    try {
      const result = await createOrder.mutateAsync({
        email: data.email,
        idempotencyKey: key,
        shippingAddress: data.address,
        saveAddress: data.saveAddress,
      });
      setOrder(result.order);
      setClientSecret(result.clientSecret);
      setLastSubmission(signature);
      setStep("review");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn't start your order. Please try again.",
      );
    }
  }

  function toConfirmation(orderId: string) {
    router.push(`/checkout/confirmation?orderId=${orderId}`);
  }

  // ── Empty / loading guards ──────────────────────────────────────────────────
  if (cartLoading && !order) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }

  if (!order && (!cart || cart.items.length === 0)) {
    return (
      <div className="py-24 text-center">
        <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 font-heading text-2xl font-bold">
          Your cart is empty
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add something before checking out.
        </p>
        <Link
          href="/search"
          className="mt-6 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_22rem]">
      <div>
        <CheckoutSteps current={step} />

        {step === "shipping" && (
          <ShippingStep
            initialEmail={email}
            initialAddress={address}
            submitting={createOrder.isPending}
            error={error}
            onSubmit={handleShipping}
          />
        )}

        {step === "review" && order && (
          <ReviewStep
            order={order}
            onBack={() => setStep("shipping")}
            onContinue={() =>
              order.grandTotal === 0
                ? toConfirmation(order.id)
                : setStep("payment")
            }
          />
        )}

        {step === "payment" && order && (
          <PaymentStep
            clientSecret={clientSecret}
            orderId={order.id}
            amountCents={order.grandTotal}
            currency={order.currency}
            onBack={() => setStep("review")}
            onPaid={() => toConfirmation(order.id)}
          />
        )}
      </div>

      <OrderSummarySidebar cart={cart} order={order} />
    </div>
  );
}
