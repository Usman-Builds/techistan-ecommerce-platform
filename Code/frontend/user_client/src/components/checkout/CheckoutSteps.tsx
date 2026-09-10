"use client";

import { Check } from "lucide-react";

export type CheckoutStep = "shipping" | "review" | "payment";

const STEPS: { key: CheckoutStep; label: string }[] = [
  { key: "shipping", label: "Shipping" },
  { key: "review", label: "Review" },
  { key: "payment", label: "Payment" },
];

/** Linear step indicator across the top of the checkout flow (FR-401). */
export function CheckoutSteps({ current }: { current: CheckoutStep }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <ol className="mb-8 flex items-center gap-2">
      {STEPS.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={step.key} className="flex flex-1 items-center gap-2">
            <span
              className={[
                "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground",
              ].join(" ")}
            >
              {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
            </span>
            <span
              className={[
                "text-sm font-medium",
                active ? "text-foreground" : "text-muted-foreground",
              ].join(" ")}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="mx-1 h-px flex-1 bg-border" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
