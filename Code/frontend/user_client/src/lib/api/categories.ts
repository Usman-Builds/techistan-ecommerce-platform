/**
 * Category reads (script 07 backend). The nested tree drives the header
 * mega-menu and homepage highlights; the by-slug detail drives the category
 * listing page (breadcrumb + immediate children).
 */
import { apiClient } from "./client";
import { serverGet } from "@/lib/server/api";

export interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  /** Admin-chosen lucide icon name; null falls back to the slug heuristic. */
  iconKey: string | null;
  sortOrder: number;
  featured: boolean;
  showInNav: boolean;
  /** Products filed directly here. */
  productCount: number;
  /** Products here AND anywhere below it — what a shopper browsing this sees. */
  totalProductCount: number;
  children: CategoryTreeNode[];
}

export interface CategoryChild {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  iconKey: string | null;
}

export interface CategoryCrumb {
  id: string;
  name: string;
  slug: string;
}

export interface CategoryDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  /** Wide cover art for the page header. Distinct crop from `imageUrl`. */
  bannerUrl: string | null;
  iconKey: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  parentId: string | null;
  children: CategoryChild[];
  _count: { products: number; children: number };
  breadcrumb: CategoryCrumb[];
}

export function getCategoryTree(): Promise<CategoryTreeNode[]> {
  return apiClient.get<CategoryTreeNode[]>("/categories/tree");
}

export async function getCategoryTreeServer(): Promise<CategoryTreeNode[]> {
  return (await serverGet<CategoryTreeNode[]>("/categories/tree")) ?? [];
}

export async function getCategoryBySlugServer(
  slug: string,
): Promise<CategoryDetail | null> {
  return serverGet<CategoryDetail>(`/categories/${encodeURIComponent(slug)}`);
}
