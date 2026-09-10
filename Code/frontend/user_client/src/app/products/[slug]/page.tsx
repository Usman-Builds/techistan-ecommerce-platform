import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getProductBySlugServer,
  listProductsServer,
} from "@/lib/api/products";
import { getSettingsServer } from "@/lib/api/settings";
import { ProductGallery } from "@/components/storefront/ProductGallery";
import { ProductPurchasePanel } from "@/components/storefront/ProductPurchasePanel";
import { ProductGrid } from "@/components/storefront/ProductGrid";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { ReviewsSection } from "@/components/reviews/ReviewsSection";
import { ogImageUrl } from "@/lib/seo/image";
import {
  JsonLd,
  breadcrumbJsonLd,
  productJsonLd,
} from "@/lib/seo/jsonLd";

// Param route → dynamic by default; SSR for SEO. `generateMetadata` fills OG /
// canonical from the product's SEO fields; the page body emits Product +
// BreadcrumbList JSON-LD (script 17). The layout title template appends the
// store name, so titles here stay bare.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlugServer(slug);
  if (!product) return { title: "Product not found" };

  const title = product.metaTitle ?? product.title;
  const description =
    product.metaDescription ?? product.description ?? undefined;
  const ogImage = ogImageUrl(product.ogImage ?? product.images[0]?.url);

  return {
    title,
    description,
    alternates: {
      canonical: product.canonicalUrl ?? `/products/${product.slug}`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: product.canonicalUrl ?? `/products/${product.slug}`,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : [],
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlugServer(slug);
  if (!product) notFound();

  const settings = await getSettingsServer();

  const related = product.category
    ? (
        await listProductsServer({
          categorySlug: product.category.slug,
          pageSize: 6,
        })
      ).items
        .filter((p) => p.id !== product.id)
        .slice(0, 5)
    : [];

  const crumbs = [
    { label: "Home", href: "/" },
    ...(product.category
      ? [{ label: product.category.name, href: `/c/${product.category.slug}` }]
      : []),
    { label: product.title },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-14 px-4 py-8">
      {/* Structured data (script 17, NFR-703): Product + breadcrumb ancestry. */}
      <JsonLd data={productJsonLd(product, settings)} />
      <JsonLd
        data={breadcrumbJsonLd(
          crumbs.map((c) => ({ name: c.label, href: c.href })),
        )}
      />

      <Breadcrumbs items={crumbs} />

      <div className="grid gap-10 lg:grid-cols-2">
        <ProductGallery images={product.images} title={product.title} />
        <ProductPurchasePanel product={product} currency={settings.currency} />
      </div>

      {product.description && (
        <section aria-labelledby="desc-heading" className="max-w-3xl space-y-3">
          <h2 id="desc-heading" className="font-heading text-xl font-bold">
            Description
          </h2>
          {/* Plain-text render (React-escaped) — safe against injected markup. */}
          <div className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {product.description}
          </div>
        </section>
      )}

      <ReviewsSection productId={product.id} />

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="space-y-6">
          <h2 id="related-heading" className="font-heading text-xl font-bold">
            You may also like
          </h2>
          <ProductGrid products={related} animate={false} />
        </section>
      )}
    </div>
  );
}
