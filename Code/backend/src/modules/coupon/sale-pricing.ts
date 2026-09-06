/**
 * Scheduled sale pricing (script 12, FR-604). A standalone helper (no Nest DI)
 * so the catalog (07), cart (09), and checkout (10) can all read the effective
 * price without importing CouponService (which would create a module cycle).
 *
 * A sale is active when a `salePrice` is set AND `now` falls within the window
 * `[saleStartsAt, saleEndsAt]` — either bound may be null (open-ended). While a
 * sale is active the effective price is `salePrice` and the regular `price`
 * becomes the compare-at (strike-through) shown by the storefront.
 */

/** The pricing fields effective-price computation needs from a variant. */
export interface SalePriced {
  price: number; // regular price, cents
  salePrice: number | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
}

/** True when a sale price is set and `now` is inside the schedule window. */
export function isSaleActive(v: SalePriced, now: Date = new Date()): boolean {
  if (v.salePrice == null) return false;
  if (v.salePrice >= v.price) return false; // never "up-sell"
  if (v.saleStartsAt && v.saleStartsAt > now) return false;
  if (v.saleEndsAt && v.saleEndsAt < now) return false;
  return true;
}

/** Effective (purchasable) price in cents: salePrice when on sale, else price. */
export function effectivePriceCents(
  v: SalePriced,
  now: Date = new Date(),
): number {
  return isSaleActive(v, now) ? (v.salePrice as number) : v.price;
}

/** Compare-at (strike-through) price, or null when no sale is active. */
export function compareAtWhenOnSale(
  v: SalePriced,
  now: Date = new Date(),
): number | null {
  return isSaleActive(v, now) ? v.price : null;
}
