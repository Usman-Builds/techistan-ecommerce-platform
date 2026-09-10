import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The Techistan mark — identical geometry to the storefront's
 * (`user_client/src/components/brand/Logo.tsx`). Duplicated rather than shared
 * because the two clients are separate Next apps with no common component
 * package; the shape lives in one path string, so keeping them in step is a
 * copy/paste, not a merge.
 *
 * A "T" punched out of a rounded tile with `fill-rule="evenodd"`, so the glyph
 * shows whatever is behind the mark and the whole logo is a single flat colour
 * driven by `currentColor`.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-8 w-8 text-primary", className)}
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7 0h18a7 7 0 0 1 7 7v18a7 7 0 0 1-7 7H7a7 7 0 0 1-7-7V7a7 7 0 0 1 7-7Zm.2 8.4h17.6l-3.2 4.8h-3.3v10.6h-4.6V13.2H7.2V8.4Z"
      />
    </svg>
  );
}

/** Sidebar brand lockup: mark, wordmark, and a neutral "Admin" qualifier. */
export function AdminLogo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Techistan admin, dashboard"
      className={cn(
        "flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <LogoMark />
      <span className="font-heading text-lg font-bold tracking-tight">
        Techistan
      </span>
      <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Admin
      </span>
    </Link>
  );
}
