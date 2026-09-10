"use client";

/** TanStack Query hooks for categories (script 07). */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createCategory,
  deleteCategory,
  getAdminCategory,
  getAdminCategoryTree,
  getCategoryTree,
  listAdminCategories,
  reorderCategories,
  updateCategory,
  type CategoryInput,
  type ReorderItem,
} from "../categories";

export const CATEGORIES_KEY = ["admin", "categories"] as const;
export const CATEGORY_TREE_KEY = ["categories", "tree"] as const;
export const ADMIN_CATEGORY_TREE_KEY = ["admin", "categories", "tree"] as const;

export function useAdminCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: listAdminCategories,
  });
}

export function useCategoryTree() {
  return useQuery({
    queryKey: CATEGORY_TREE_KEY,
    queryFn: getCategoryTree,
  });
}

/**
 * Tree for admin pickers — includes hidden categories, and each node carries
 * its icon and product counts so a picker row can show more than a name.
 *
 * Given a long staleTime because it feeds nearly every form on the admin and
 * changes only when someone edits the category tree, which invalidates it
 * explicitly below.
 */
export function useAdminCategoryTree() {
  return useQuery({
    queryKey: ADMIN_CATEGORY_TREE_KEY,
    queryFn: getAdminCategoryTree,
    staleTime: 5 * 60_000,
  });
}

export function useAdminCategory(id: string | undefined) {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, id],
    queryFn: () => getAdminCategory(id as string),
    enabled: Boolean(id),
  });
}

function useInvalidateCategories() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
    qc.invalidateQueries({ queryKey: CATEGORY_TREE_KEY });
    qc.invalidateQueries({ queryKey: ADMIN_CATEGORY_TREE_KEY });
  };
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (input: CategoryInput) => createCategory(input),
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CategoryInput> }) =>
      updateCategory(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, reassignTo }: { id: string; reassignTo?: string }) =>
      deleteCategory(id, reassignTo),
    onSuccess: invalidate,
  });
}

export function useReorderCategories() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (items: ReorderItem[]) => reorderCategories(items),
    onSuccess: invalidate,
  });
}
