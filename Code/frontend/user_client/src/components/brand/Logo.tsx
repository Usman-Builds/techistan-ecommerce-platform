import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The Techistan mark.
 *
 * A drawn monogram rather than a borrowed icon-set glyph (it used to be
 * lucide's `Cpu` in a gradient tile, which is neither ownable nor distinctive).
 * It is a "T" inside a rounded tile, with the right end of the crossbar cut on
 * a 45° chamfer — a small piece of geometry that keeps the letterform obvious at
 * 20px while giving the mark something of its own.
 *
 * Deliberately ONE flat colour. The mark has to survive being stamped on a
 * favicon, an email header, an invoice and a dark-mode navbar; anything with a
 * gradient or a second hue stops working in at least one of those.
 *
 * `currentColor` drives the tile, so the mark inherits context: brand gold in
 * the header, white when it sits on a dark surface. The glyph is punched out of
 * the tile with `fill-rule="evenodd"` instead of being painted on top, so it
 * shows the page behind it and never needs a matching "foreground" colour.
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

/**
 * Mark + wordmark, wrapped in a link home. `logoUrl` from store settings wins
 * when the merchant has uploaded their own artwork — this is the fallback, and
 * it is a designed fallback rather than a placeholder.
 */
export function Logo({
  name,
  logoUrl,
  className,
  markClassName,
  wordmarkClassName,
  href = "/",
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={`${name} home`}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={name}
          width={140}
          height={36}
          className="h-8 w-auto"
        />
      ) : (
        <>
          <LogoMark className={markClassName} />
          <span
            className={cn(
              "font-heading text-xl font-bold tracking-tight text-foreground",
              wordmarkClassName,
            )}
          >
            {name}
          </span>
        </>
      )}
    </Link>
  );
}
