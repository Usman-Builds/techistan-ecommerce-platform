import type { Metadata } from "next";
import Link from "next/link";
import { BadgePercent, PackageOpen } from "lucide-react";
import { listProductsServer, type ProductSort } from "@/lib/api/products";
import { ProductGrid } from "@/components/storefront/ProductGrid";
import { Pagination } from "@/components/storefront/Pagination";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { ListingToolbar } from "@/components/storefront/ListingToolbar";

// Sale windows open and close on a schedule, so this must never be cached.
export const dynamic = "force-dynamic";

/**
 * Deals listing — every product carrying the `on-sale` tag.
 *
 * This exists because the homepage deals rail and the clearance promo poster
 * both need somewhere real to send "View all", and the search page has no
 * on-sale filter: its facets are category/brand/price/rating. Filtering by tag
 * is already supported by GET /products, so this is a thin listing over that.
 */
const PAGE_SIZE = 24;
const SALE_TAG = "on-sale";

const VALID_SORTS = new Set<ProductSort>([
  "newest",
  "price_asc",
  "price_desc",
  "best_selling",
  "top_rated",
]);

export const metadata: Metadata = {
  title: "Deals",
  description:
    "Every Techistan product currently on sale — laptops, audio, gaming gear and accessories at their lowest price.",
  alternates: { canonical: "/deals" },
};

type SearchParams = { [key: string]: string | string[] | undefined };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Dollar string → integer cents (rounded), or undefined when blank/invalid. */
function toCents(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const sortParam = first(sp.sort);
  const sort: ProductSort =
    sortParam && VALID_SORTS.has(sortParam as ProductSort)
      ? (sortParam as ProductSort)
      : "newest";

  // ListingToolbar writes ?min=/?max= in DOLLARS (it labels the inputs "$"),
  // while the products API takes integer cents — same conversion the category
  // listing does.
  const minStr = first(sp.min);
  const maxStr = first(sp.max);

  const { items, total } = await listProductsServer({
    tag: SALE_TAG,
    sort,
    page,
    pageSize: PAGE_SIZE,
    minPrice: toCents(minStr),
    maxPrice: toCents(maxStr),
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Deals" }]} />

      <section className="rounded-2xl bg-primary px-6 py-12 text-primary-foreground">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 ring-1 ring-white/25 eyebrow">
            <BadgePercent className="h-3.5 w-3.5" aria-hidden />
            Limited time
          </span>
          <h1 className="font-heading text-3xl font-bold sm:text-4xl">
            Deals worth grabbing
          </h1>
          <p className="max-w-lg text-sm opacity-90">
            {total > 0
              ? `${total} product${total === 1 ? "" : "s"} on sale right now. Prices return to normal when the sale window closes.`
              : "No sale is running at the moment — check back soon."}
          </p>
        </div>
      </section>

      {items.length > 0 ? (
        <>
          <ListingToolbar sort={sort} min={minStr} max={maxStr} />

          <ProductGrid products={items} showCategory />
          <Pagination page={page} totalPages={totalPages} />
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card py-20 text-center">
          <PackageOpen className="h-9 w-9 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Nothing is on sale right now.
          </p>
          <Link
            href="/search"
            className="text-sm font-semibold text-primary hover:underline"
          >
            Browse the full catalog
          </Link>
        </div>
      )}
    </div>
  );
}
