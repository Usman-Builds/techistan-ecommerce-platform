/** Typed category API bindings (script 07, extended in script 18). */
import { apiClient } from "./client";

export type CategoryTreeNode = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  iconKey: string | null;
  sortOrder: number;
  featured: boolean;
  showInNav: boolean;
  /** Products filed directly here. */
  productCount: number;
  /** Products here AND anywhere below — what a shopper browsing this sees. */
  totalProductCount: number;
  children: CategoryTreeNode[];
};

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  imageId: string | null;
  imageUrl: string | null;
  bannerId: string | null;
  bannerUrl: string | null;
  iconKey: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  isActive: boolean;
  showInNav: boolean;
  featured: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count: { products: number; children: number };
};

/** {@link AdminCategory} plus the parent summary the editor header shows. */
export type AdminCategoryDetail = AdminCategory & {
  parent: { id: string; name: string; slug: string } | null;
};

export type CategoryInput = {
  name: string;
  slug?: string;
  parentId?: string | null;
  sortOrder?: number;
  description?: string | null;
  imageId?: string | null;
  imageUrl?: string | null;
  bannerId?: string | null;
  bannerUrl?: string | null;
  iconKey?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  isActive?: boolean;
  showInNav?: boolean;
  featured?: boolean;
};

export type ReorderItem = {
  id: string;
  parentId?: string | null;
  sortOrder: number;
};

// ── Public ──
export function getCategoryTree(): Promise<CategoryTreeNode[]> {
  return apiClient.get<CategoryTreeNode[]>("/categories/tree");
}

// ── Admin ──
export function listAdminCategories(): Promise<AdminCategory[]> {
  return apiClient.get<AdminCategory[]>("/admin/categories");
}

/**
 * Tree INCLUDING hidden categories. The admin picker must show a category the
 * merchant has hidden — otherwise hiding one would silently make it impossible
 * to file a product into it.
 */
export function getAdminCategoryTree(): Promise<CategoryTreeNode[]> {
  return apiClient.get<CategoryTreeNode[]>("/admin/categories/tree");
}

export function getAdminCategory(id: string): Promise<AdminCategoryDetail> {
  return apiClient.get<AdminCategoryDetail>(`/admin/categories/${id}`);
}

export function createCategory(input: CategoryInput): Promise<AdminCategory> {
  return apiClient.post<AdminCategory>("/admin/categories", input);
}

export function updateCategory(
  id: string,
  input: Partial<CategoryInput>,
): Promise<AdminCategory> {
  return apiClient.patch<AdminCategory>(`/admin/categories/${id}`, input);
}

export function deleteCategory(
  id: string,
  reassignTo?: string,
): Promise<{ id: string; deleted: boolean; reassignedTo: string | null }> {
  const qs = reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : "";
  return apiClient.delete(`/admin/categories/${id}${qs}`);
}

export function reorderCategories(
  items: ReorderItem[],
): Promise<{ updated: number }> {
  return apiClient.post("/admin/categories/reorder", { items });
}
