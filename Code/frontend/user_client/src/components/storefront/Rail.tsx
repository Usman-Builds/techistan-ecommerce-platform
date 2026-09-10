"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal, swipable rail — the shared primitive behind the homepage product
 * and category carousels.
 *
 * It is a REAL scroll container (`overflow-x-auto` + scroll-snap), not a
 * transform-based carousel, which is what makes it work everywhere for free:
 * touch swipe and trackpad flicks are native, keyboard users can Tab through the
 * children and the browser scrolls them into view, and there is no "current
 * index" state to desynchronise. The arrow buttons are a pointer-device
 * affordance layered on top — they page by one viewport-width and are hidden
 * from assistive tech (`aria-hidden`), because a screen-reader user reaches the
 * items through the list itself, and announcing "scroll right" would be noise.
 *
 * Scrollbar chrome is suppressed via `.no-scrollbar` (globals.css) since the
 * arrow buttons already signal that there is more content. There are no edge
 * fades: a fade is a gradient, and the arrows do the same job with no paint.
 */
export function Rail({
  children,
  ariaLabel,
  className,
  itemClassName,
}: {
  children: React.ReactNode;
  /** Names the list for assistive tech, e.g. "Trending now products". */
  ariaLabel: string;
  className?: string;
  /** Applied to the generated <li> wrappers — usually the item width. */
  itemClassName?: string;
}) {
  const scroller = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  // Recompute which arrows are usable. Called on scroll, on resize, and once on
  // mount — the last one matters because a rail whose content fits entirely
  // (few products) must show no arrows at all.
  const sync = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 1);
    // 1px slack absorbs sub-pixel rounding at fractional zoom levels, where
    // scrollLeft never quite reaches scrollWidth - clientWidth.
    setAtEnd(el.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync]);

  const page = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    // Leave a sliver of the outgoing item visible so the swipe reads as
    // continuous rather than as a hard slide change.
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  };

  const hasOverflow = !(atStart && atEnd);

  return (
    <div className={cn("relative", className)}>
      <ul
        ref={scroller}
        onScroll={sync}
        aria-label={ariaLabel}
        className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overscroll-x-contain pb-2"
      >
        {Array.isArray(children)
          ? children.map((child, i) => (
              <li key={i} className={cn("shrink-0 snap-start", itemClassName)}>
                {child}
              </li>
            ))
          : children}
      </ul>

      {hasOverflow && (
        <>
          <RailButton
            side="left"
            disabled={atStart}
            onClick={() => page(-1)}
          />
          <RailButton side="right" disabled={atEnd} onClick={() => page(1)} />
        </>
      )}
    </div>
  );
}

function RailButton({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
      aria-hidden
      className={cn(
        "absolute top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-foreground shadow-md transition hover:bg-muted md:grid",
        disabled && "pointer-events-none opacity-0",
        side === "left" ? "-left-3 lg:-left-5" : "-right-3 lg:-right-5",
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}
