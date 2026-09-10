"use client";

import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  useAddToWishlist,
  useRemoveFromWishlist,
  useWishlist,
} from "@/lib/api/hooks/cart";
import { cn } from "@/lib/utils";

/**
 * Wishlist heart toggle (script 09, FR-307). Customer-only: guests are sent to
 * /login on click. When signed in, it reflects membership from the wishlist
 * query and toggles add/remove. Deliberately minimal — script 14 restyles it.
 */
export function WishlistButton({
  productId,
  className,
}: {
  productId: string;
  className?: string;
}) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { data: wishlist } = useWishlist(isAuthenticated);
  const add = useAddToWishlist();
  const remove = useRemoveFromWishlist();

  const inWishlist = Boolean(wishlist?.some((p) => p.id === productId));
  const busy = add.isPending || remove.isPending;

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      router.push("/login?next=/search");
      return;
    }
    if (inWishlist) remove.mutate(productId);
    else add.mutate(productId);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={inWishlist}
      aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-full border border-border bg-card/90 backdrop-blur transition-colors hover:bg-muted disabled:opacity-50",
        className,
      )}
    >
      <Heart
        className={cn(
          "h-4 w-4",
          inWishlist ? "fill-primary text-primary" : "text-muted-foreground",
        )}
        aria-hidden
      />
    </button>
  );
}
