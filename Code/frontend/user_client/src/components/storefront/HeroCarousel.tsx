"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BadgePercent,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Star,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { categoryVisual } from "./category-visuals";
import { cn } from "@/lib/utils";
import { PAGE_GUTTER } from "./page-shell";

/**
 * Icons a slide can badge itself with. Slides are built on the server and a
 * component reference is not serialisable across the RSC boundary, so a slide
 * carries a KEY and the lookup happens here, on the client.
 */
const SLIDE_ICONS = {
  deals: BadgePercent,
  new: Sparkles,
  featured: Star,
  power: Zap,
} as const;

export type HeroIconKey = keyof typeof SLIDE_ICONS;

export interface HeroSlide {
  key: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  href: string;
  ctaLabel: string;
  imageUrl: string | null;
  /** Explicit badge icon; when omitted, `categorySlug` picks one. */
  iconKey?: HeroIconKey;
  /** Category slug, for slides that promote a category. */
  categorySlug?: string;
}

/**
 * Returns the slide's badge icon wrapped in an object rather than bare, so the
 * call site destructures it (`const { icon: Icon } = …`) exactly the way
 * `categoryVisual` is consumed everywhere else. Assigning the raw return of a
 * call to a capitalised binding and rendering it trips the React Compiler's
 * `react-hooks/static-components` rule.
 */
function slideVisual(slide: HeroSlide): { icon: LucideIcon } {
  if (slide.iconKey) return { icon: SLIDE_ICONS[slide.iconKey] };
  if (slide.categorySlug) return categoryVisual(slide.categorySlug);
  return { icon: SLIDE_ICONS.featured };
}

const AUTOPLAY_MS = 6500;

/**
 * Full-bleed poster carousel at the top of the homepage.
 *
 * Like {@link Rail} this is a native scroll-snap container rather than a
 * transform carousel, so a swipe on touch is the browser's own gesture and
 * costs us nothing. On top of that it adds what a hero specifically needs:
 * autoplay, dots, and arrows.
 *
 * Autoplay is deliberately constrained, because an auto-moving banner is a
 * classic accessibility trap (WCAG 2.2.2 — moving content must be pausable):
 *  - it never runs under `prefers-reduced-motion`,
 *  - it pauses while the pointer is over the hero or focus is inside it, so it
 *    can't yank a link out from under someone mid-click or mid-read,
 *  - it pauses when the tab is hidden, and
 *  - it stops permanently once the visitor takes control (swipe, arrow, dot),
 *    since at that point they are driving, not the timer.
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userDriving, setUserDriving] = useState(false);
  const reduced = useReducedMotion();

  const count = slides.length;

  // Derive the active slide from real scroll position rather than tracking it
  // separately, so a native swipe and a button press stay in agreement.
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  const goTo = useCallback(
    (index: number, smooth = true) => {
      const el = scroller.current;
      if (!el) return;
      el.scrollTo({
        left: index * el.clientWidth,
        behavior: smooth && !reduced ? "smooth" : "auto",
      });
    },
    [reduced],
  );

  // Pause while the tab is in the background — an unseen carousel advancing is
  // pure wasted work, and it would jump several slides on return.
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (reduced || userDriving || paused || count < 2) return;
    const timer = window.setInterval(
      () => goTo((active + 1) % count),
      AUTOPLAY_MS,
    );
    return () => window.clearInterval(timer);
  }, [active, count, goTo, paused, reduced, userDriving]);

  if (count === 0) return null;

  const take = (index: number) => {
    setUserDriving(true);
    goTo((index + count) % count);
  };

  return (
    <section
      aria-label="Featured collections"
      aria-roledescription="carousel"
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setUserDriving(true)}
    >
      <div
        ref={scroller}
        onScroll={onScroll}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {slides.map((slide, i) => (
          <Slide
            key={slide.key}
            slide={slide}
            index={i}
            total={count}
            active={i === active}
          />
        ))}
      </div>

      {count > 1 && (
        <>
          {/* Dots double as the carousel's accessible control set: each is a real
           * button with the slide's name, so the hero is fully operable without
           * a swipe gesture. */}
          <div className="absolute inset-x-0 bottom-4 z-20 flex items-center justify-center gap-2">
            {slides.map((slide, i) => (
              <button
                key={slide.key}
                type="button"
                onClick={() => take(i)}
                aria-label={`Show slide ${i + 1}: ${slide.title}`}
                aria-current={i === active}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  i === active
                    ? "w-8 bg-white"
                    : "w-2 bg-white/45 hover:bg-white/70",
                )}
              />
            ))}
          </div>

          <HeroArrow side="left" onClick={() => take(active - 1)} />
          <HeroArrow side="right" onClick={() => take(active + 1)} />
        </>
      )}
    </section>
  );
}

function HeroArrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      // The dots already expose every slide by name, so exposing these too would
      // just duplicate the same destinations in the tab order.
      tabIndex={-1}
      aria-hidden
      className={cn(
        "absolute top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/25 text-white backdrop-blur transition hover:bg-black/45 md:grid",
        side === "left" ? "left-4" : "right-4",
      )}
    >
      <Icon className="h-6 w-6" aria-hidden />
    </button>
  );
}

function Slide({
  slide,
  index,
  total,
  active,
}: {
  slide: HeroSlide;
  index: number;
  total: number;
  active: boolean;
}) {
  const { icon: Icon } = slideVisual(slide);

  return (
    <div
      className="relative min-w-full snap-start"
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${total}`}
      // Keeps off-screen slides out of the tab order and the a11y tree, so Tab
      // from the header lands on the CTA the visitor can actually see.
      // `inert` is a first-class boolean prop in React 19.
      aria-hidden={!active}
      inert={!active}
    >
      <div className="relative h-[26rem] w-full overflow-hidden sm:h-[30rem] lg:h-[34rem]">
        {slide.imageUrl ? (
          <Image
            src={slide.imageUrl}
            alt=""
            fill
            // The first slide is the homepage LCP element at every breakpoint,
            // which is exactly the case `preload` is for. (`priority` is
            // deprecated in Next 16 — node_modules/next/dist/docs/01-app/
            // 03-api-reference/02-components/image.md.)
            preload={index === 0}
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <span className="bg-primary absolute inset-0" aria-hidden />
        )}

        {/* Flat scrim. This was a two-layer affair — a dark ramp plus a wash of
         * the slide's own accent hue — which tinted every hero a different
         * colour. One even tint, dark enough that the headline clears AA over
         * any photograph the merchant seeds. */}
        <span className="absolute inset-0 bg-black/55" aria-hidden />

        <div
          className={cn(
            "relative flex h-full max-w-3xl flex-col items-start justify-center gap-5",
            PAGE_GUTTER,
          )}
        >
          <span className="eyebrow inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-white ring-1 ring-white/25 backdrop-blur">
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {slide.eyebrow}
          </span>

          <h2 className="poster-text font-heading max-w-2xl text-4xl leading-[1.05] font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            {slide.title}
          </h2>

          <p className="poster-text max-w-lg text-base text-white/85 sm:text-lg">
            {slide.subtitle}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href={slide.href}
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              {slide.ctaLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/search"
              className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              Shop all
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
