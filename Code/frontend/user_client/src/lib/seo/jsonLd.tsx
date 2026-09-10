/**
 * JSON-LD structured data (script 17, NFR-703). Builders return plain objects;
 * the `<JsonLd>` component renders them the Next.js-recommended way — a native
 * `<script type="application/ld+json">` with `<` scrubbed to `<` to prevent
 * XSS via injected markup (see node_modules/next/dist/docs .../json-ld.md).
 */
import type { StoreSettings } from "@/lib/api/settings";
import type { ProductDetail } from "@/lib/api/products";
import { SITE_URL, absoluteUrl } from "./site";
import { structuredImageUrl } from "./image";

type JsonLdObject = Record<string, unknown>;

export function JsonLd({ data }: { data: JsonLdObject }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

/** Organization node for the root layout — name, logo, social profiles. */
export function organizationJsonLd(settings: StoreSettings): JsonLdObject {
  const sameAs = settings.socials
    ? Object.values(settings.socials).filter(Boolean)
    : [];
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: settings.name,
    url: SITE_URL,
    ...(settings.logoUrl ? { logo: settings.logoUrl } : {}),
    ...(settings.contactEmail ? { email: settings.contactEmail } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

/** WebSite node with the storefront search action (sitelinks searchbox). */
export function websiteJsonLd(settings: StoreSettings): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: settings.name,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** BreadcrumbList from an ordered list of {name, href?} trail items. */
export function breadcrumbJsonLd(
  items: { name: string; href?: string }[],
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      ...(item.href ? { item: absoluteUrl(item.href) } : {}),
    })),
  };
}

/** Product node — offers from integer cents, availability from variant stock. */
export function productJsonLd(
  product: ProductDetail,
  settings: StoreSettings,
): JsonLdObject {
  const url = absoluteUrl(product.canonicalUrl ?? `/products/${product.slug}`);
  const images = product.images
    .map((img) => structuredImageUrl(img.url))
    .filter((u): u is string => Boolean(u))
    .slice(0, 5);

  const inStock = product.variants.some((v) => v.stock > 0);
  const low = product.priceMin;
  const high = product.priceMax;
  const currency = settings.currency;
  const availability = inStock
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";

  // AggregateOffer when the variant range spans a price band; a single Offer
  // otherwise. Prices are integer cents → 2dp decimal strings.
  const offers =
    low !== null && high !== null && high !== low
      ? {
          "@type": "AggregateOffer",
          lowPrice: (low / 100).toFixed(2),
          highPrice: (high / 100).toFixed(2),
          priceCurrency: currency,
          offerCount: product.variants.length,
          availability,
          url,
        }
      : {
          "@type": "Offer",
          price: ((low ?? high ?? 0) / 100).toFixed(2),
          priceCurrency: currency,
          availability,
          url,
        };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    ...(images.length ? { image: images } : {}),
    ...(product.description ? { description: product.description } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand.name } } : {}),
    ...(product.variants[0]?.sku ? { sku: product.variants[0].sku } : {}),
    offers,
    ...(product.rating.count > 0 && product.rating.average !== null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating.average.toFixed(1),
            reviewCount: product.rating.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}
