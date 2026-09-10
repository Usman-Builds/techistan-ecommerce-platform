"use client";

/** TanStack Query hooks for promotions management (script 12). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applyBulkSale,
  bulkCoupons,
  createAutomaticDiscount,
  createCoupon,
  deleteAutomaticDiscount,
  deleteCoupon,
  generateCoupons,
  getAutomaticDiscount,
  getCoupon,
  getCouponAnalytics,
  getRedemptions,
  listAutomaticDiscounts,
  listCouponBatches,
  listCoupons,
  previewBulkSale,
  setSale,
  clearSale,
  toggleCoupon,
  updateAutomaticDiscount,
  updateCoupon,
  type AutomaticDiscountInput,
  type BulkCouponInput,
  type BulkSaleInput,
  type CouponInput,
  type CouponQuery,
  type GenerateCouponsInput,
  type SaleInput,
} from "../promotions";

export const COUPONS_KEY = ["admin", "coupons"] as const;
export const COUPON_KEY = (id: string) => ["admin", "coupon", id] as const;
export const COUPON_BATCHES_KEY = ["admin", "coupon-batches"] as const;
export const DISCOUNTS_KEY = ["admin", "automatic-discounts"] as const;
export const DISCOUNT_KEY = (id: string) =>
  ["admin", "automatic-discount", id] as const;
/** Sales write variant prices, so both catalog caches go stale. */
const CATALOG_KEYS = [["admin", "products"], ["admin", "inventory"]] as const;

// ── Coupons ────────────────────────────────────────────────────────────────
export function useCoupons(query: CouponQuery) {
  return useQuery({
    queryKey: [...COUPONS_KEY, query],
    queryFn: () => listCoupons(query),
    placeholderData: (prev) => prev,
  });
}

export function useCoupon(id: string | undefined) {
  return useQuery({
    queryKey: COUPON_KEY(id ?? "none"),
    queryFn: () => getCoupon(id!),
    enabled: !!id,
  });
}

export function useCouponRedemptions(id: string | undefined) {
  return useQuery({
    queryKey: [...COUPON_KEY(id ?? "none"), "redemptions"],
    queryFn: () => getRedemptions(id!),
    enabled: !!id,
  });
}

export function useCouponAnalytics(id: string | undefined) {
  return useQuery({
    queryKey: [...COUPON_KEY(id ?? "none"), "analytics"],
    queryFn: () => getCouponAnalytics(id!),
    enabled: !!id,
  });
}

export function useCouponBatches() {
  return useQuery({
    queryKey: COUPON_BATCHES_KEY,
    queryFn: listCouponBatches,
  });
}

export function useCreateCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CouponInput) => createCoupon(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: COUPONS_KEY }),
  });
}

export function useGenerateCoupons() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateCouponsInput) => generateCoupons(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COUPONS_KEY });
      qc.invalidateQueries({ queryKey: COUPON_BATCHES_KEY });
    },
  });
}

export function useBulkCoupons() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkCouponInput) => bulkCoupons(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COUPONS_KEY });
      qc.invalidateQueries({ queryKey: COUPON_BATCHES_KEY });
    },
  });
}

export function useUpdateCoupon(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CouponInput>) => updateCoupon(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COUPON_KEY(id) });
      qc.invalidateQueries({ queryKey: COUPONS_KEY });
    },
  });
}

export function useToggleCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => toggleCoupon(id),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: COUPON_KEY(c.id) });
      qc.invalidateQueries({ queryKey: COUPONS_KEY });
    },
  });
}

export function useDeleteCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCoupon(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: COUPONS_KEY }),
  });
}

// ── Automatic discounts ──────────────────────────────────────────────────────
export function useAutomaticDiscounts() {
  return useQuery({
    queryKey: DISCOUNTS_KEY,
    queryFn: () => listAutomaticDiscounts(),
  });
}

export function useAutomaticDiscount(id: string | undefined) {
  return useQuery({
    queryKey: DISCOUNT_KEY(id ?? "none"),
    queryFn: () => getAutomaticDiscount(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateAutomaticDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AutomaticDiscountInput) => createAutomaticDiscount(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: DISCOUNTS_KEY }),
  });
}

export function useUpdateAutomaticDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: Partial<AutomaticDiscountInput> }) =>
      updateAutomaticDiscount(vars.id, vars.input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: DISCOUNTS_KEY });
      qc.invalidateQueries({ queryKey: DISCOUNT_KEY(vars.id) });
    },
  });
}

export function useDeleteAutomaticDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAutomaticDiscount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: DISCOUNTS_KEY }),
  });
}

// ── Sales ────────────────────────────────────────────────────────────────────
export function useSetSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { productId: string; input: SaleInput }) =>
      setSale(vars.productId, vars.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "products"] }),
  });
}

export function useClearSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => clearSale(productId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "products"] }),
  });
}

/**
 * Run one sale across a scope. Invalidates BOTH catalog caches: a sale rewrites
 * variant prices, which the inventory screen also displays.
 */
export function useBulkSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkSaleInput) => applyBulkSale(input),
    onSuccess: () => {
      for (const key of CATALOG_KEYS) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/**
 * How many products a scope would hit. Read-only, so it is safe to fire as the
 * admin edits the scope — which is the point: the confirm button can say
 * "Apply to 34 products" instead of asking for blind faith.
 */
export function usePreviewBulkSale(input: BulkSaleInput, enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "sales", "preview", input],
    queryFn: () => previewBulkSale(input),
    enabled,
    staleTime: 30_000,
  });
}
