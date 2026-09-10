"use client";

/**
 * Cookie-consent banner (script 17, CR-005). Only shown when cookie-setting
 * analytics are actually configured (GA4) AND the visitor hasn't decided yet —
 * cookieless Plausible needs no consent, so with only Plausible there is nothing
 * to consent to. Accessible: labelled region, keyboard-operable buttons, and it
 * dismisses itself once a choice is stored.
 */
import { useConsent } from "@/lib/analytics/consent";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function CookieConsentBanner() {
  const { consent, ready, accept, reject } = useConsent();

  // Nothing that sets cookies → no banner. Also wait for the stored decision to
  // load (avoids a flash) and hide once the visitor has chosen.
  if (!GA_ID || !ready || consent !== null) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use privacy-friendly analytics to understand how the store is used.
          You can accept optional analytics cookies or continue with essential
          cookies only.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={reject}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={accept}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Accept analytics
          </button>
        </div>
      </div>
    </div>
  );
}
