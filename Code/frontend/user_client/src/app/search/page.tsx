import { Suspense } from "react";
import type { Metadata } from "next";
import { SearchView } from "@/components/search/SearchView";

export const metadata: Metadata = {
  title: "Search",
  description: "Search the catalog with filters, sorting, and facets.",
  // Search-results URLs are per-query and thin — keep them out of the index
  // (script 17) while still allowing crawlers to follow links out of the page.
  robots: { index: false, follow: true },
};

/**
 * Storefront search page (script 08). `SearchView` reads the URL `searchParams`
 * via `useSearchParams`, so it is wrapped in a Suspense boundary (required for
 * prerendering in Next 16 — see node_modules/next/dist/docs use-search-params).
 */
export default function SearchPage() {
  return (
    <Suspense fallback={<SearchFallback />}>
      <SearchView />
    </Suspense>
  );
}

function SearchFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mx-auto h-10 max-w-2xl animate-pulse rounded-md bg-muted" />
    </div>
  );
}
