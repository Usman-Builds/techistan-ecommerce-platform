"use client";

import { setStoreCurrency } from "@/lib/format";

/**
 * Makes the store currency the default for the money helpers in `lib/format`
 * (#49). Set during render, before the children render, so the very first
 * paint already uses the right minor units (e.g. 0 for JPY).
 */
export function StoreCurrency({
  currency,
  children,
}: {
  currency: string;
  children: React.ReactNode;
}) {
  setStoreCurrency(currency);
  return <>{children}</>;
}
