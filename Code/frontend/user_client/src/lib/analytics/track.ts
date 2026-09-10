/**
 * Conversion-event tracking (script 17, NFR-705). A thin, provider-agnostic
 * `track()` that forwards to whichever analytics scripts have loaded — cookieless
 * Plausible (always, when configured) and GA4 (only after consent). Safe to call
 * anywhere: it no-ops on the server and when no provider is present, so call
 * sites never need to know which analytics is active.
 */

export type AnalyticsEvent =
  | "add_to_cart"
  | "begin_checkout"
  | "purchase";

type PlausibleFn = (
  event: string,
  options?: { props?: Record<string, string | number | boolean> },
) => void;
type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    plausible?: PlausibleFn & { q?: unknown[] };
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}

export function track(
  event: AnalyticsEvent,
  props?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  try {
    window.plausible?.(event, props ? { props } : undefined);
    window.gtag?.("event", event, props ?? {});
  } catch {
    // analytics must never break a user flow
  }
}
