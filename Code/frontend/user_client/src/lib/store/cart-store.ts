"use client";

/**
 * Guest cart UI store (script 09, Task 10). The AUTHORITATIVE cart lives on the
 * server (`GET /cart`, keyed by the signed guest cookie or the JWT). This Zustand
 * store is a thin, localStorage-persisted MIRROR so the header badge and drawer
 * paint instantly on reload — before the first server round-trip resolves — and
 * so optimistic UI has somewhere to read from. It is reconciled to server truth
 * via {@link CartUiState.sync} on every successful cart response.
 *
 * It intentionally does NOT own line mutations: adds/updates/removes go through
 * the TanStack Query hooks (server calls), which then `sync()` the result here.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Cart, CartLine } from "@/lib/api/cart";

interface CartUiState {
  /** Last-known server snapshot (persisted for instant first paint). */
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  /** Drawer open/close (not persisted — always starts closed). */
  isOpen: boolean;

  sync: (cart: Cart) => void;
  reset: () => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCartStore = create<CartUiState>()(
  persist(
    (set) => ({
      items: [],
      itemCount: 0,
      subtotal: 0,
      isOpen: false,

      sync: (cart) =>
        set({
          items: cart.items,
          itemCount: cart.itemCount,
          subtotal: cart.subtotal,
        }),
      reset: () => set({ items: [], itemCount: 0, subtotal: 0 }),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
    }),
    {
      name: "techistan-cart-mirror",
      // Persist only the snapshot, never the transient drawer state.
      partialize: (s) => ({
        items: s.items,
        itemCount: s.itemCount,
        subtotal: s.subtotal,
      }),
    },
  ),
);
