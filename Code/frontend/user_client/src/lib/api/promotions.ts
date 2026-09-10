/**
 * Public promotions (script 18).
 *
 * Only coupons a merchant has explicitly marked public appear here — a code
 * mailed to a win-back segment must never leak through a public endpoint just
 * because it is active. That filtering happens server-side; this module is only
 * the binding.
 */
import { apiClient } from "./client";

export type CouponType = "PERCENT" | "FIXED" | "FREE_SHIPPING";
export type PromotionScope = "ALL" | "CATEGORY" | "PRODUCT";

export interface PublicOffer {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  type: CouponType;
  /** Whole percent for PERCENT, integer cents for FIXED, unused otherwise. */
  value: number;
  minOrder: number | null;
  maxDiscount: number | null;
  expiresAt: string | null;
  scope: PromotionScope;
}

export function listOffers(): Promise<PublicOffer[]> {
  return apiClient.get<PublicOffer[]>("/promotions/offers");
}
