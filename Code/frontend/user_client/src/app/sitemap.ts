import type { MetadataRoute } from "next";
import { BACKEND_URL } from "@/lib/api/client";
import { SITE_URL } from "@/lib/seo/site";

/**
 * Dynamic sitemap (script 17, NFR-702). Server-evaluated cached Route Handler:
 * fetches every published product + category from the NestJS backend (never the
 * DB) and merges them with the static routes. Revalidates hourly so it tracks
 * the catalog without rebuilds. Backend failures degrade to the static routes
 * rather than breaking the response.
 */
export const revalidate = 3600;

type SitemapEntry = { slug: string; updatedAt: string };

async function fetchEntries(path: string): Promise<SitemapEntry[]> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return [];
    return (await res.json()) as SitemapEntry[];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([
    fetchEntries("/products/sitemap"),
    fetchEntries("/categories/sitemap"),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: "weekly", priority: 0.3 },
  ];

  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${SITE_URL}/products/${p.slug}`,
    lastModified: new Date(p.updatedAt),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${SITE_URL}/c/${c.slug}`,
    lastModified: new Date(c.updatedAt),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
