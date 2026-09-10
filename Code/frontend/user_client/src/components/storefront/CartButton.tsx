"use client";

import { ShoppingBag } from "lucide-react";
import { useCartStore } from "@/lib/store/cart-store";

/**
 * Cart trigger with a live item-count badge (script 09). The count reads from
 * the persisted Zustand mirror so it paints instantly on reload, then reconciles
 * to server truth once `useCart` resolves. Clicking opens the CartDrawer.
 */
export function CartButton({ className }: { className?: string }) {
  const count = useCartStore((s) => s.itemCount);
  const open = useCartStore((s) => s.open);

  return (
    <button
      type="button"
      onClick={open}
      aria-label={`Open cart${count ? `, ${count} items` : ""}`}
      className={
        className ??
        "relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-muted"
      }
    >
      <ShoppingBag className="h-5 w-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
