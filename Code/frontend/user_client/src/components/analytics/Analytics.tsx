"use client";

/**
 * Analytics loader (script 17, NFR-705). Loads scripts the Next 16 way via
 * `next/script` (afterInteractive):
 *   • Plausible — cookieless, privacy-friendly, PREFERRED. Loads whenever
 *     NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set, with no consent required (its script
 *     sets no cookies and auto-tracks SPA navigations).
 *   • GA4 — OPTIONAL and cookie-based, so it only initializes after the visitor
 *     accepts cookies (consent === "granted"). Route changes send page_view.
 * With neither env var set, this renders nothing.
 */
import { useEffect } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useConsent } from "@/lib/analytics/consent";

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function Analytics() {
  const { consent } = useConsent();
  const pathname = usePathname();
  const gaEnabled = Boolean(GA_ID) && consent === "granted";

  // GA4 SPA page_view on client navigation (the initial view is sent by config).
  useEffect(() => {
    if (!gaEnabled || !window.gtag || !GA_ID) return;
    window.gtag("event", "page_view", {
      page_path: pathname,
      page_location: window.location.href,
    });
  }, [pathname, gaEnabled]);

  return (
    <>
      {PLAUSIBLE_DOMAIN && (
        <Script
          defer
          strategy="afterInteractive"
          data-domain={PLAUSIBLE_DOMAIN}
          src="https://plausible.io/js/script.js"
        />
      )}

      {gaEnabled && (
        <>
          <Script
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { anonymize_ip: true });
            `}
          </Script>
        </>
      )}
    </>
  );
}
