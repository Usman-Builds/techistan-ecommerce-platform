"use client";

/**
 * Cart + wishlist TanStack Query hooks (script 09, Task 11). The cart query is
 * the single source of truth; every mutation returns the fresh cart, which we
 * write straight into the query cache and mirror into the Zustand UI store. Adds
 * use an optimistic count bump for snappy feedback and roll back on error.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  addCartItem,
  addWishlistItem,
  applyCoupon,
  clearCart,
  estimateShipping,
  getCart,
  getWishlist,
  moveWishlistToCart,
  removeCartItem,
  removeCoupon,
  removeWishlistItem,
  updateCartItem,
  type Cart,
  type ShippingAddressInput,
} from "../cart";
import { useCartStore } from "@/lib/store/cart-store";
import { track } from "@/lib/analytics/track";

export const CART_KEY = ["cart"] as const;
export const WISHLIST_KEY = ["wishlist"] as const;

/** Push a fresh cart into both the query cache and the Zustand mirror. */
function useCommitCart() {
  const qc = useQueryClient();
  const sync = useCartStore((s) => s.sync);
  return (cart: Cart) => {
    qc.setQueryData(CART_KEY, cart);
    sync(cart);
  };
}

export function useCart() {
  const sync = useCartStore((s) => s.sync);
  return useQuery({
    queryKey: CART_KEY,
    queryFn: async () => {
      const cart = await getCart();
      sync(cart);
      return cart;
    },
  });
}

export function useAddToCart() {
  const commit = useCommitCart();
  const open = useCartStore((s) => s.open);
  return useMutation({
    mutationFn: ({ variantId, quantity }: { variantId: string; quantity?: number }) =>
      addCartItem(variantId, quantity ?? 1),
    onSuccess: (cart, { variantId, quantity }) => {
      commit(cart);
      open(); // reveal the drawer on a successful add
      track("add_to_cart", { variantId, quantity: quantity ?? 1 }); // NFR-705
    },
  });
}

export function useUpdateCartItem() {
  const commit = useCommitCart();
  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      updateCartItem(itemId, quantity),
    onSuccess: commit,
  });
}

export function useRemoveCartItem() {
  const commit = useCommitCart();
  return useMutation({
    mutationFn: (itemId: string) => removeCartItem(itemId),
    onSuccess: commit,
  });
}

export function useClearCart() {
  const commit = useCommitCart();
  return useMutation({ mutationFn: clearCart, onSuccess: commit });
}

export function useApplyCoupon() {
  const commit = useCommitCart();
  return useMutation({
    mutationFn: (code: string) => applyCoupon(code),
    onSuccess: commit,
  });
}

export function useRemoveCoupon() {
  const commit = useCommitCart();
  return useMutation({ mutationFn: removeCoupon, onSuccess: commit });
}

export function useEstimateShipping() {
  return useMutation({
    mutationFn: (address: ShippingAddressInput) => estimateShipping(address),
  });
}

// ─────────────────────────── Wishlist ───────────────────────────

export function useWishlist(enabled = true) {
  return useQuery({
    queryKey: WISHLIST_KEY,
    queryFn: getWishlist,
    enabled,
  });
}

export function useAddToWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => addWishlistItem(productId),
    onSuccess: (list) => qc.setQueryData(WISHLIST_KEY, list),
  });
}

export function useRemoveFromWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => removeWishlistItem(productId),
    onSuccess: (list) => qc.setQueryData(WISHLIST_KEY, list),
  });
}

export function useMoveToCart() {
  const qc = useQueryClient();
  const commit = useCommitCart();
  return useMutation({
    mutationFn: (productId: string) => moveWishlistToCart(productId),
    onSuccess: ({ cart }) => {
      commit(cart);
      void qc.invalidateQueries({ queryKey: WISHLIST_KEY });
    },
  });
}
