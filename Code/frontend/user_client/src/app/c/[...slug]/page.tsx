import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PackageOpen } from "lucide-react";
import { getCategoryBySlugServer } from "@/lib/api/categories";
import { listProductsServer, type ProductSort } from "@/lib/api/products";
import { ProductGrid } from "@/components/storefront/ProductGrid";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { Pagination } from "@/components/storefront/Pagination";
import { ListingToolbar } from "@/components/storefront/ListingToolbar";
import { CategoryPosterCard } from "@/components/storefront/CategoryPoster";
import { categoryVisual } from "@/components/storefront/category-visuals";
import { ogImageUrl } from "@/lib/seo/image";
import { JsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonLd";

// Category listings are SSR (SEO) and read live filter/sort params per request.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;
const VALID_SORTS = new Set<ProductSort>([
  "newest",
  "price_asc",
  "price_desc",
  "best_selling",
  "top_rated",
]);

type SearchParams = { [key: string]: string | string[] | undefined };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseSort(v: string | undefined): ProductSort {
  return v && VALID_SORTS.has(v as ProductSort) ? (v as ProductSort) : "newest";
}

/** Dollar string → integer cents (rounded), or undefined when blank/invalid. */
function toCents(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const leaf = slug[slug.length - 1];
  const category = await getCategoryBySlugServer(leaf);
  if (!category) return { title: "Category not found" };

  // The admin's SEO overrides win; the generated copy is the fallback for a
  // category nobody has written meta for yet.
  const title = category.metaTitle?.trim() || category.name;
  const description =
    category.metaDescription?.trim() ||
    category.description?.trim() ||
    `Shop ${category.name} — browse the full range and filter by price, rating, and more.`;
  // Prefer the wide banner for social cards: an OG image is a 1.91:1 crop, so a
  // portrait poster gets badly letterboxed there.
  const ogImage = ogImageUrl(category.bannerUrl ?? category.imageUrl);

  return {
    title,
    description,
    alternates: { canonical: `/c/${category.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/c/${category.slug}`,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : [],
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : [],
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const leaf = slug[slug.length - 1];

  const category = await getCategoryBySlugServer(leaf);
  if (!category) notFound();

  const page = Math.max(1, Number(first(sp.page)) || 1);
  const sort = parseSort(first(sp.sort));
  const minStr = first(sp.min);
  const maxStr = first(sp.max);

  const { items, total } = await listProductsServer({
    categorySlug: category.slug,
    sort,
    page,
    pageSize: PAGE_SIZE,
    minPrice: toCents(minStr),
    maxPrice: toCents(maxStr),
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { icon: CategoryIcon } = categoryVisual(
    category.slug,
    category.name,
    category.iconKey,
  );
  // The banner is the crop meant for this shape; the square poster is a
  // fallback so a category with only one image still gets a header photo.
  const headerImage = category.bannerUrl ?? category.imageUrl;

  const crumbs = [
    { label: "Home", href: "/" },
    ...category.breadcrumb.map((c) => ({
      label: c.name,
      href: `/c/${c.slug}`,
    })),
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      {/* BreadcrumbList structured data (script 17, NFR-703). */}
      <JsonLd
        data={breadcrumbJsonLd(
          crumbs.map((c) => ({ name: c.label, href: c.href })),
        )}
      />

      <Breadcrumbs items={crumbs} />

      {/* Poster header — the category's own photo behind a flat scrim, so a
       * listing opens with the same visual language as the homepage rails
       * instead of a bare text heading. Categories with no artwork get a solid
       * brand panel; neither case is a gradient, and neither depends on the
       * category having a "colour" of its own. */}
      <header className="relative overflow-hidden rounded-2xl bg-primary px-6 py-10 text-white sm:px-8 sm:py-12">
        {headerImage && (
          <>
            <Image
              src={headerImage}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
            />
            <span className="absolute inset-0 bg-black/60" aria-hidden />
          </>
        )}

        <div className="relative flex items-center gap-4">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur"
            aria-hidden
          >
            <CategoryIcon className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h1 className="poster-text font-heading text-3xl font-bold sm:text-4xl">
              {category.name}
            </h1>
            <p className="text-sm text-white/85">
              {total} product{total === 1 ? "" : "s"}
              {category.children.length > 0 &&
                ` · ${category.children.length} sub-categor${category.children.length === 1 ? "y" : "ies"}`}
            </p>
          </div>
        </div>

        {/* Merchandising copy, when the merchant wrote some. Capped in width
         * because a line of prose running the full 1280px header is unreadable
         * however good the copy is. */}
        {category.description && (
          <p className="poster-text relative mt-5 max-w-2xl text-sm leading-relaxed text-white/90 sm:text-base">
            {category.description}
          </p>
        )}
      </header>

      {category.children.length > 0 && (
        <section aria-labelledby="subcategories" className="space-y-4">
          <h2 id="subcategories" className="font-heading text-lg font-bold">
            Browse {category.name}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {category.children.map((child) => (
              <li key={child.id}>
                <CategoryPosterCard category={child} size="sm" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ListingToolbar sort={sort} min={minStr} max={maxStr} />

      {items.length > 0 ? (
        <>
          <ProductGrid products={items} />
          <Pagination page={page} totalPages={totalPages} />
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
          <PackageOpen className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            No products match these filters.
          </p>
          <Link
            href={`/c/${category.slug}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Clear filters
          </Link>
        </div>
      )}
    </div>
  );
}
