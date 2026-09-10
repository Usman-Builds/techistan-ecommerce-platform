import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

/**
 * A single full-width promotional panel — the homepage's "one thing we want you
 * to see" block, placed by the admin between rails.
 *
 * Same treatment as the promo tiles and category posters: the photograph is the
 * poster and the only overlay is a FLAT black scrim, never a gradient. With no
 * artwork it falls back to a solid brand panel rather than an empty box, so a
 * banner written before its image is uploaded still looks deliberate.
 */
export function HomeBanner({
  id,
  eyebrow,
  title,
  subtitle,
  href,
  ctaLabel,
  imageUrl,
}: {
  id: string;
  eyebrow?: string | null;
  title: string;
  subtitle?: string | null;
  href?: string | null;
  ctaLabel?: string | null;
  imageUrl?: string | null;
}) {
  const body = (
    <>
      {imageUrl && (
        <>
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
          <span className="absolute inset-0 bg-black/55" aria-hidden />
        </>
      )}

      <span className="relative block max-w-2xl">
        {eyebrow && (
          <span className="block text-white/80 eyebrow">
            {eyebrow}
          </span>
        )}
        <span
          id={id}
          className="poster-text mt-2 block font-heading text-2xl font-bold leading-tight text-white sm:text-3xl"
        >
          {title}
        </span>
        {subtitle && (
          <span className="mt-2 block text-sm text-white/85">{subtitle}</span>
        )}
        {href && ctaLabel && (
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform group-hover:translate-x-0.5">
            {ctaLabel}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        )}
      </span>
    </>
  );

  const shell =
    "group relative flex min-h-[16rem] flex-col justify-end overflow-hidden rounded-2xl border border-border bg-primary p-6 sm:p-10";

  if (!href) {
    return (
      <section aria-labelledby={id} className={shell}>
        {body}
      </section>
    );
  }

  return (
    <section aria-labelledby={id}>
      <Link
        href={href}
        className={`${shell} transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
      >
        {body}
      </Link>
    </section>
  );
}
