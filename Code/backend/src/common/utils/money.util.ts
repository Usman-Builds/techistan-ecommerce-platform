/**
 * Money formatting (script 10, FR-415). Money is integer cents everywhere in the
 * system; this converts to a human string for emails, PDFs, and logs. The
 * user_client mirrors this in `src/lib/utils/money.ts`.
 *
 * Uses Intl.NumberFormat so currency symbol and minor-unit digits follow the
 * currency (most are 2 decimals; JPY/KRW are 0 — Intl handles that).
 */
export function formatMoney(cents: number, currency = 'USD'): string {
  const code = (currency || 'USD').toUpperCase();
  try {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
    });
    // Divide by the currency's minor-unit factor (10^fractionDigits).
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    const factor = Math.pow(10, digits);
    return formatter.format(cents / factor);
  } catch {
    // Unknown currency code → fall back to a plain 2-decimal representation.
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}
