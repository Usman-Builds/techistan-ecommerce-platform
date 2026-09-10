import Link from "next/link";
import Image from "next/image";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PromoTile {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  imageUrl: string | null;
  icon: LucideIcon;
  /** Wide tiles span two columns on desktop — use for the lead promo. */
  wide?: boolean;
}

/**
 * Editorial promo posters — the photographic blocks between the product rails.
 *
 * These used to be bold accent GRADIENTS with the photo blended into them at
 * 30% opacity, one hue per tile. Now the photograph is the poster and the only
 * overlay is a flat black scrim: photos are the colour on this page, so the
 * chrome around them stays out of the way. A tile with no artwork falls back to
 * a solid brand panel with its icon watermarked — still deliberate, still one
 * colour.
 *
 * The scrim is a flat tint rather than a soft ramp, which keeps the contrast
 * guarantee for the copy independent of how bright the underlying photo is.
 */
export function PromoTiles({ tiles }: { tiles: PromoTile[] }) {
  if (tiles.length === 0) return null;

  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {tiles.map((tile) => {
        const Icon = tile.icon;

        return (
          <li key={tile.key} className={cn(tile.wide && "md:col-span-2")}>
            <Link
              href={tile.href}
              className="group relative flex h-full min-h-[15rem] flex-col justify-end overflow-hidden rounded-2xl border border-border bg-primary p-6 text-white transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {tile.imageUrl ? (
                <>
                  <Image
                    src={tile.imageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 66vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-0 bg-black/55" aria-hidden />
                </>
              ) : (
                <Icon
                  className="pointer-events-none absolute -bottom-6 -right-6 h-44 w-44 text-white/15"
                  aria-hidden
                />
              )}

              <span className="relative flex items-center gap-2 text-white/80 eyebrow">
                <Icon className="h-4 w-4" aria-hidden />
                {tile.eyebrow}
              </span>

              <span className="poster-text relative mt-2 font-heading text-2xl font-bold leading-tight sm:text-3xl">
                {tile.title}
              </span>

              <span className="relative mt-1.5 max-w-sm text-sm text-white/85">
                {tile.body}
              </span>

              <span className="relative mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform group-hover:translate-x-0.5">
                {tile.cta}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
