/**
 * Promotions admin API bindings (script 12). Coupons, automatic (no-code)
 * discounts, and scheduled product sales — all through the credentialed
 * `apiClient` against the `@AdminOnly()`-guarded backend routes (RBAC enforced
 * server-side, NFR-208). Money is integer cents; a PERCENT coupon's `value` is a
 * whole percent (0–100).
 */
import { apiClient } from "./client";

export type CouponType = "PERCENT" | "FIXED" | "FREE_SHIPPING";
export type DiscountStatus = "ACTIVE" | "SCHEDULED" | "DISABLED";

/**
 * What a promotion is allowed to discount. Shared by coupons, automatic
 * discounts and bulk sales so the three speak one vocabulary.
 *
 * CATEGORY matches the whole SUBTREE — scoping to Computers covers Laptops.
 */
export type PromotionScope = "ALL" | "CATEGORY" | "PRODUCT";

/** The restriction half of every promotion payload. */
export interface PromotionScopeInput {
  scope?: PromotionScope;
  productIds?: string[];
  categoryIds?: string[];
  /** When false, lines already on sale are excluded from the discount. */
  appliesToSaleItems?: boolean;
}

/** Scope targets as the API returns them, with names for display. */
export interface ScopeTargets {
  products: { productId: string; product: { title: string; slug: string } }[];
  categories: {
    categoryId: string;
    category: { name: string; slug: string };
  }[];
}

export interface Coupon {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  scope: PromotionScope;
  appliesToSaleItems: boolean;
  isPublic: boolean;
  batchId: string | null;
  type: CouponType;
  value: number; // whole percent (PERCENT) or cents (FIXED)
  minOrder: number | null;
  maxDiscount: number | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present on list rows: how many targets the scope holds. */
  _count?: { products: number; categories: number };
}

/** A coupon plus its hydrated scope targets (the detail endpoint). */
export type CouponDetail = Coupon & ScopeTargets;

export interface CouponListResponse {
  items: Coupon[];
  total: number;
  page: number;
  pageSize: number;
}

export type CouponStatusFilter =
  | "active"
  | "inactive"
  | "expired"
  | "scheduled";

export interface CouponQuery {
  search?: string;
  status?: CouponStatusFilter;
  scope?: PromotionScope;
  type?: CouponType;
  batchId?: string;
  page?: number;
  pageSize?: number;
}

export interface CouponBatch {
  batchId: string;
  count: number;
  name: string | null;
  createdAt: string;
}

export interface CouponInput extends PromotionScopeInput {
  code: string;
  name?: string | null;
  description?: string | null;
  type: CouponType;
  value: number;
  minOrder?: number | null;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  active?: boolean;
  isPublic?: boolean;
}

/** Mint a batch of unique codes that share one set of rules. */
export interface GenerateCouponsInput extends PromotionScopeInput {
  count: number;
  prefix?: string;
  separator?: "-" | "_" | "";
  suffixLength?: number;
  name?: string | null;
  description?: string | null;
  type: CouponType;
  value: number;
  minOrder?: number | null;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  active?: boolean;
}

export interface GenerateCouponsResult {
  batchId: string;
  count: number;
  coupons: Coupon[];
}

export interface BulkCouponInput {
  action: "activate" | "deactivate" | "delete";
  ids?: string[];
  batchId?: string;
}

export interface CouponRedemption {
  id: string;
  discountCents: number;
  createdAt: string;
  user: { id: number; email: string } | null;
  order: { id: string; orderNumber: string; grandTotal: number } | null;
}

export interface RedemptionsResponse {
  count: number;
  redemptions: CouponRedemption[];
}

export interface CouponAnalytics {
  couponId: string;
  code: string;
  redemptionCount: number;
  totalDiscountCents: number;
  attributedRevenueCents: number;
  averageOrderValueCents: number;
}

export interface AutomaticDiscountRule {
  minSubtotal?: number;
  minQty?: number;
  percentOff?: number;
  amountOff?: number;
  freeShipping?: boolean;
}

export interface AutomaticDiscount {
  id: string;
  name: string;
  description: string | null;
  rule: AutomaticDiscountRule;
  scope: PromotionScope;
  appliesToSaleItems: boolean;
  priority: number;
  status: DiscountStatus;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { products: number; categories: number };
}

export type AutomaticDiscountDetail = AutomaticDiscount & ScopeTargets;

export interface AutomaticDiscountInput extends PromotionScopeInput {
  name: string;
  description?: string | null;
  rule: AutomaticDiscountRule;
  priority?: number;
  status?: DiscountStatus;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface SaleInput {
  percentOff?: number;
  salePriceCents?: number;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
}

/**
 * One sale across a scope — every ACTIVE product, a category subtree, or a
 * hand-picked set. `clear` ends the sale on everything in scope.
 */
export interface BulkSaleInput extends PromotionScopeInput {
  percentOff?: number;
  salePriceCents?: number;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
  clear?: boolean;
}

export interface BulkSaleResult {
  cleared: boolean;
  productsUpdated: number;
  variantsUpdated: number;
}

/** How much a bulk sale would touch, without touching it. */
export interface BulkSalePreview {
  products: number;
  variants: number;
}

function toQuery(params: Record<string, unknown> | CouponQuery): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ── Coupons ────────────────────────────────────────────────────────────────
export function listCoupons(query: CouponQuery = {}): Promise<CouponListResponse> {
  return apiClient.get<CouponListResponse>(`/admin/coupons${toQuery(query)}`);
}

export function getCoupon(id: string): Promise<CouponDetail> {
  return apiClient.get<CouponDetail>(`/admin/coupons/${id}`);
}

export function listCouponBatches(): Promise<CouponBatch[]> {
  return apiClient.get<CouponBatch[]>("/admin/coupons/batches");
}

export function generateCoupons(
  input: GenerateCouponsInput,
): Promise<GenerateCouponsResult> {
  return apiClient.post<GenerateCouponsResult>("/admin/coupons/generate", input);
}

export function bulkCoupons(
  input: BulkCouponInput,
): Promise<{ action: string; count: number }> {
  return apiClient.post("/admin/coupons/bulk", input);
}

export function createCoupon(input: CouponInput): Promise<Coupon> {
  return apiClient.post<Coupon>("/admin/coupons", input);
}

export function updateCoupon(
  id: string,
  input: Partial<CouponInput>,
): Promise<Coupon> {
  return apiClient.patch<Coupon>(`/admin/coupons/${id}`, input);
}

export function toggleCoupon(id: string): Promise<Coupon> {
  return apiClient.patch<Coupon>(`/admin/coupons/${id}/toggle`);
}

export function deleteCoupon(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiClient.delete(`/admin/coupons/${id}`);
}

export function getRedemptions(id: string): Promise<RedemptionsResponse> {
  return apiClient.get<RedemptionsResponse>(`/admin/coupons/${id}/redemptions`);
}

export function getCouponAnalytics(id: string): Promise<CouponAnalytics> {
  return apiClient.get<CouponAnalytics>(`/admin/coupons/${id}/analytics`);
}

// ── Automatic discounts ──────────────────────────────────────────────────────
export function listAutomaticDiscounts(): Promise<AutomaticDiscount[]> {
  return apiClient.get<AutomaticDiscount[]>("/admin/automatic-discounts");
}

export function getAutomaticDiscount(
  id: string,
): Promise<AutomaticDiscountDetail> {
  return apiClient.get<AutomaticDiscountDetail>(
    `/admin/automatic-discounts/${id}`,
  );
}

export function createAutomaticDiscount(
  input: AutomaticDiscountInput,
): Promise<AutomaticDiscount> {
  return apiClient.post<AutomaticDiscount>("/admin/automatic-discounts", input);
}

export function updateAutomaticDiscount(
  id: string,
  input: Partial<AutomaticDiscountInput>,
): Promise<AutomaticDiscount> {
  return apiClient.patch<AutomaticDiscount>(
    `/admin/automatic-discounts/${id}`,
    input,
  );
}

export function deleteAutomaticDiscount(
  id: string,
): Promise<{ id: string; deleted: boolean }> {
  return apiClient.delete(`/admin/automatic-discounts/${id}`);
}

// ── Sales ────────────────────────────────────────────────────────────────────
export interface SaleResult {
  productId: string;
  variantsUpdated: number;
  cleared: boolean;
}

export function setSale(productId: string, input: SaleInput): Promise<SaleResult> {
  return apiClient.put<SaleResult>(`/admin/products/${productId}/sale`, input);
}

export function clearSale(productId: string): Promise<SaleResult> {
  return apiClient.delete(`/admin/products/${productId}/sale`);
}

export function applyBulkSale(input: BulkSaleInput): Promise<BulkSaleResult> {
  return apiClient.post<BulkSaleResult>("/admin/sales/bulk", input);
}

export function previewBulkSale(
  input: BulkSaleInput,
): Promise<BulkSalePreview> {
  return apiClient.post<BulkSalePreview>("/admin/sales/preview", input);
}
