/**
 * Cart + wishlist API bindings (script 09). Everything goes through the shared
 * credentialed `apiClient` so the guest cart cookie (signed, httpOnly — set by
 * the backend) rides along automatically, and customer requests carry the JWT.
 * Money is integer cents end-to-end.
 */
import { apiClient } from "./client";
import type { ProductListCard } from "./search";

// ─────────────────────────── Response shapes (mirror the backend) ───────────

export interface LineAvailability {
  available: number;
  clamped: boolean;
  outOfStock: boolean;
}

export interface CartLine {
  id: string;
  productId: string;
  variantId: string;
  slug: string;
  title: string;
  image: { url: string; alt: string | null } | null;
  options: Record<string, string>;
  unitPrice: number; // cents
  quantity: number;
  lineSubtotal: number; // cents
  availability: LineAvailability;
}

export interface CartCoupon {
  code: string;
  valid: boolean;
  freeShipping: boolean;
  discountCents: number;
  message?: string;
}

export interface Cart {
  id: string | null;
  items: CartLine[];
  itemCount: number;
  subtotal: number; // cents
  coupon: CartCoupon | null;
  discountTotal: number; // cents
  total: number; // cents
}

export interface ShippingEstimate {
  amountCents: number;
  label: string;
  currency: string;
  subtotal: number;
}

export interface ShippingAddressInput {
  country?: string;
  region?: string;
  postalCode?: string;
}

// ─────────────────────────── Cart calls ───────────────────────────

export const getCart = () => apiClient.get<Cart>("/cart");

export const addCartItem = (variantId: string, quantity = 1) =>
  apiClient.post<Cart>("/cart/items", { variantId, quantity });

export const updateCartItem = (itemId: string, quantity: number) =>
  apiClient.patch<Cart>(`/cart/items/${itemId}`, { quantity });

export const removeCartItem = (itemId: string) =>
  apiClient.delete<Cart>(`/cart/items/${itemId}`);

export const clearCart = () => apiClient.delete<Cart>("/cart");

export const applyCoupon = (code: string) =>
  apiClient.post<Cart>("/cart/coupon", { code });

export const removeCoupon = () => apiClient.delete<Cart>("/cart/coupon");

export const estimateShipping = (address: ShippingAddressInput) =>
  apiClient.post<ShippingEstimate>("/cart/estimate-shipping", address);

// ─────────────────────────── Wishlist calls ───────────────────────────

export const getWishlist = () =>
  apiClient.get<ProductListCard[]>("/wishlist");

export const addWishlistItem = (productId: string) =>
  apiClient.post<ProductListCard[]>("/wishlist/items", { productId });

export const removeWishlistItem = (productId: string) =>
  apiClient.delete<ProductListCard[]>(`/wishlist/items/${productId}`);

export const moveWishlistToCart = (productId: string) =>
  apiClient.post<{ moved: boolean; cart: Cart }>(
    `/wishlist/items/${productId}/move-to-cart`,
  );
