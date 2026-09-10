import { cn } from "@/lib/utils";

/** Animated placeholder block. Respects reduced-motion via the pulse utility. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden
    />
  );
}
