import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Section header for the homepage rails.
 *
 * Sections are told apart by their words — the eyebrow and the title — not by
 * colour. An earlier revision gave each rail its own hue so the page read as a
 * sequence of coloured zones; with six of them in a column it just read as
 * noise. The only colour here is the brand gold on the icon chip and the eyebrow,
 * and it is the same gold in every section, which is what makes the stack scan
 * as one page.
 *
 * `id` is wired to the section's `aria-labelledby`, so the heading names the
 * region for assistive tech.
 */
export function SectionHeading({
  id,
  eyebrow,
  title,
  icon: Icon,
  href,
  linkLabel = "View all",
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  icon?: LucideIcon;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-end justify-between gap-3", className)}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div>
          {eyebrow && (
            <p className="text-muted-foreground eyebrow">
              {eyebrow}
            </p>
          )}
          <h2 id={id} className="font-heading text-xl font-bold sm:text-2xl">
            {title}
          </h2>
        </div>
      </div>

      {href && (
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {linkLabel}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}
