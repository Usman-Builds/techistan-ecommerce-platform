"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, Loader2 } from "lucide-react";
import {
  toSearchQueryString,
  type SearchQuery,
  type SortOption,
} from "@/lib/api/search";
import { useSearch } from "@/lib/api/hooks/search";
import { SearchAutocomplete } from "./SearchAutocomplete";
import { FilterPanel } from "./FilterPanel";
import { SortControl } from "./SortControl";
import { ProductCard } from "./ProductCard";
import { RecentlyViewed } from "./RecentlyViewed";

const PAGE_SIZE = 12;

const numParam = (v: string | null): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * URL-driven search experience (script 08). All state — query, filters, sort,
 * page — lives in the URL `searchParams` so results are shareable, bookmarkable,
 * and survive refresh. Filter/sort interactions push a new URL; the query
 * refetches with previous results kept in place for a smooth transition.
 */
export function SearchView() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Parse the URL into a filter object (memoized on the raw query string).
  const filters = useMemo<SearchQuery>(() => {
    const category = sp.getAll("category");
    const brand = sp.getAll("brand");
    return {
      q: sp.get("q") ?? undefined,
      category: category.length ? category : undefined,
      brand: brand.length ? brand : undefined,
      minPrice: numParam(sp.get("minPrice")),
      maxPrice: numParam(sp.get("maxPrice")),
      rating: numParam(sp.get("rating")),
      inStock: sp.get("inStock") === "true" || undefined,
      sort: (sp.get("sort") as SortOption) ?? undefined,
      page: numParam(sp.get("page")) ?? 1,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.toString()]);

  const queryParams = useMemo<SearchQuery>(
    () => ({ ...filters, pageSize: PAGE_SIZE }),
    [filters],
  );

  const { data, isPending, isFetching, isError } = useSearch(queryParams);

  const updateUrl = (next: SearchQuery) => {
    const qs = toSearchQueryString(next);
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Merge a filter change; reset to page 1 unless the change is itself a page.
  const patch = (p: Partial<SearchQuery>) => {
    const next: SearchQuery = { ...filters, ...p };
    if (!("page" in p)) next.page = 1;
    updateUrl(next);
  };

  const clearFilters = () => {
    // Keep the text query + sort; drop every facet filter.
    updateUrl({ q: filters.q, sort: filters.sort, page: 1 });
  };

  const facets = data?.facets;
  const total = data?.total ?? 0;
  const page = filters.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentSort: SortOption =
    filters.sort ?? (filters.q ? "relevance" : "newest");

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
      {/* Search box */}
      <div className="mx-auto max-w-2xl">
        <SearchAutocomplete initialQuery={filters.q ?? ""} />
      </div>

      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            {filters.q ? `Results for “${filters.q}”` : "All products"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isPending ? "Searching…" : `${total} product${total === 1 ? "" : "s"}`}
          </p>
        </div>
        <SortControl value={currentSort} onChange={(sort) => patch({ sort })} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
        {/* Filters */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          {facets ? (
            <FilterPanel
              facets={facets}
              filters={filters}
              onChange={patch}
              onClear={clearFilters}
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" aria-hidden /> Loading filters…
            </div>
          )}
        </aside>

        {/* Results */}
        <div className="space-y-6" aria-busy={isFetching}>
          {isPending ? (
            <ResultsSkeleton />
          ) : isError ? (
            <p className="py-12 text-center text-sm text-destructive">
              Something went wrong loading results. Please try again.
            </p>
          ) : data && data.items.length > 0 ? (
            <>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {data.items.map((item) => (
                  <li key={item.id}>
                    <ProductCard
                      product={{
                        id: item.id,
                        title: item.title,
                        slug: item.slug,
                        priceMin: item.priceMin,
                        priceMax: item.priceMax,
                        image: item.primaryImage,
                        rating: item.rating,
                        highlight: item.highlight,
                      }}
                    />
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPage={(p) => patch({ page: p })}
                />
              )}
            </>
          ) : (
            <div className="py-16 text-center">
              <p className="text-sm font-medium">No products found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different search or clear your filters.
              </p>
            </div>
          )}
        </div>
      </div>

      <RecentlyViewed />
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-lg border border-border bg-card"
        >
          <div className="aspect-square bg-muted" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  return (
    <nav
      className="flex items-center justify-center gap-2"
      aria-label="Pagination"
    >
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        Previous
      </button>
      <span className="text-sm text-muted-foreground" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        Next
      </button>
    </nav>
  );
}
