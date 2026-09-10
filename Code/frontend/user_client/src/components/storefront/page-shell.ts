/**
 * The storefront's page gutter — the ONLY thing that holds content back from
 * the edge of the screen.
 *
 * There is no `max-w-*` cap any more. The layout used to centre everything in a
 * 1280px column, which on a 27" monitor left a third of the display empty on
 * each side while the product rails scrolled four cards at a time. Blocks now
 * span the viewport the way the hero always did, and only this gutter is
 * reserved — widening with the screen so the content never runs into the glass.
 *
 * It lives in one place because the header, the footer and the page body must
 * line up to the pixel. A heading that starts left of the logo above it is the
 * kind of misalignment that reads as a broken page rather than a wide one, and
 * three copies of the same class string is exactly how that happens.
 *
 * Tailwind's scanner reads these class names straight out of this file, so the
 * utilities are generated even though no JSX here mentions them.
 */
export const PAGE_GUTTER = "px-4 sm:px-6 lg:px-10";
