import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, Quote } from "lucide-react";
import { Stars } from "@/components/reviews/StarRating";
import { SectionHeading } from "./SectionHeading";
import type { Testimonial } from "@/lib/api/storefront";

/**
 * Customer reviews, pulled from across the catalog.
 *
 * Every quote here is a real APPROVED review row with a real product behind it,
 * ranked by the helpful votes other shoppers actually cast. Nothing is authored
 * in the admin, which is the point: a testimonials block a merchant can type
 * into is a testimonials block nobody believes, and the moment it is editable
 * someone will fill it with invented praise.
 *
 * Two details do the persuading. Each card names the PRODUCT it is about and
 * links to it, so the block doubles as merchandising rather than atmosphere;
 * and a review written against a real order carries a "Verified purchase"
 * badge, which is the one claim on this page a shopper can check.
 *
 * Renders nothing when there are no qualifying reviews. A store with three
 * customers should not be showing an empty "what people say" heading.
 */
export function Testimonials({
  id,
  eyebrow,
  title,
  href,
  linkLabel,
  testimonials,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  href?: string;
  linkLabel?: string;
  testimonials: Testimonial[];
}) {
  if (testimonials.length === 0) return null;

  return (
    <section aria-labelledby={id} className="space-y-5">
      <SectionHeading
        id={id}
        eyebrow={eyebrow}
        title={title}
        icon={Quote}
        href={href}
        linkLabel={linkLabel}
      />

      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {testimonials.map((t) => (
          <li key={t.id}>
            <figure className="border-border bg-card flex h-full flex-col gap-4 rounded-2xl border p-5">
              <div className="flex items-center justify-between gap-3">
                <Stars value={t.rating} size={15} />
                {t.verified && (
                  <span className="bg-success/15 text-success inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                    Verified purchase
                  </span>
                )}
              </div>

              <blockquote className="flex-1 space-y-1.5">
                {t.title && (
                  <p className="font-heading text-sm font-bold">{t.title}</p>
                )}
                {/* Capped rather than clamped with CSS: a card whose text is
                 * visually cut mid-word looks broken, and the full review is one
                 * click away on the product page anyway. */}
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {truncate(t.body, 240)}
                </p>
              </blockquote>

              <figcaption className="border-border flex items-center gap-3 border-t pt-4">
                <Link
                  href={`/products/${t.product.slug}`}
                  className="group flex min-w-0 items-center gap-3 focus-visible:outline-none"
                >
                  <span className="bg-muted relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                    {t.product.imageUrl && (
                      <Image
                        src={t.product.imageUrl}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="group-hover:text-primary block truncate text-sm font-semibold">
                      {t.author}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      on {t.product.title}
                    </span>
                  </span>
                </Link>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Cut at the last word boundary before `max`, so no card ends mid-word. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`;
}
