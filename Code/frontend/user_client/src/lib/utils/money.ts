/**
 * Currency formatting (script 10, Task 11) — mirrors the backend `formatMoney`
 * helper (`src/common/utils/money.util.ts`). Money is integer cents on the wire;
 * this is the single place the storefront converts cents → a display string with
 * the order's currency.
 */
export function formatMoney(cents: number, currency = "USD"): string {
  const code = (currency || "USD").toUpperCase();
  try {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    const factor = Math.pow(10, digits);
    return formatter.format(cents / factor);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}
