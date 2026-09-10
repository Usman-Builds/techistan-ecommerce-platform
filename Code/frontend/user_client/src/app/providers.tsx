"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { StorefrontCart } from "@/components/storefront/StorefrontCart";
import { ConsentProvider } from "@/lib/analytics/consent";
import { Analytics } from "@/components/analytics/Analytics";
import { CookieConsentBanner } from "@/components/analytics/CookieConsentBanner";

/**
 * Client-side providers mounted from the server root layout.
 * A fresh QueryClient is created per browser session (kept in state so it is
 * stable across re-renders and never shared between requests on the server).
 *
 * There is no theme provider: the storefront is single-mode (pitch black and
 * gold), so the palette is a static `:root` block in the generated stylesheet
 * rather than a class something has to toggle at runtime.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ConsentProvider>
          {children}
          <StorefrontCart />
          <Analytics />
          <CookieConsentBanner />
        </ConsentProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
