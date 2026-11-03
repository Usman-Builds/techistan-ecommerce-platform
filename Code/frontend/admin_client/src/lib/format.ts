/**
 * Money helpers. The backend stores integer minor units ("cents"); the UI edits
 * major units ("dollars"). The minor-unit count comes from the currency itself
 * (2 for USD, 0 for JPY, 3 for BHD), the same rule the backend
 * (`common/utils/money.util.ts`), the storefront and Stripe use (#49). Assuming
 * 2 everywhere made a ¥1,000 price be stored, shown and charged as ¥100,000.
 */

let storeCurrency = "USD";

/**
 * Set the store's currency (from StoreSetting) used as the default by every
 * helper below. Called once by the admin shell and again after the settings
 * form saves a new currency.
 */
export function setStoreCurrency(currency: string | null | undefined): void {
  if (currency && /^[A-Za-z]{3}$/.test(currency)) {
    storeCurrency = currency.toUpperCase();
  }
}

export function getStoreCurrency(): string {
  return storeCurrency;
}

/** Number of minor-unit digits for an ISO-4217 code (USD 2, JPY 0, BHD 3). */
export function minorUnitDigits(currency: string = storeCurrency): number {
  try {
    return (
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2; // unknown code: fall back to the common case
  }
}

/** Format integer minor units as a currency string, e.g. 1999 → "$19.99". */
export function formatCents(
  cents: number | null | undefined,
  currency: string = storeCurrency,
): string {
  if (cents == null) return "—";
  const digits = minorUnitDigits(currency);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(cents / 10 ** digits);
  } catch {
    return `${(cents / 10 ** digits).toFixed(digits)} ${currency}`;
  }
}

/** Format a min/max cents range, collapsing when equal. */
export function formatPriceRange(
  min: number | null,
  max: number | null,
  currency: string = storeCurrency,
): string {
  if (min == null) return "—";
  if (max == null || min === max) return formatCents(min, currency);
  return `${formatCents(min, currency)} – ${formatCents(max, currency)}`;
}

/**
 * Parse a major-units string ("19.99", or "1000" for JPY) into integer minor
 * units. Returns null if blank, NaN if not a non-negative number.
 */
export function dollarsToCents(
  input: string,
  currency: string = storeCurrency,
): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return NaN;
  return Math.round(value * 10 ** minorUnitDigits(currency));
}

/** Render integer minor units as a plain major-units input value ("19.99"). */
export function centsToDollars(
  cents: number | null | undefined,
  currency: string = storeCurrency,
): string {
  if (cents == null) return "";
  const digits = minorUnitDigits(currency);
  return (cents / 10 ** digits).toFixed(digits);
}
