"use client";

/** TanStack Query hooks for catalog products (script 07). */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  bulkUpdateProducts,
  createProduct,
  deleteProduct,
  duplicateProduct,
  getAdminProduct,
  listAdminProducts,
  setProductImages,
  updateProduct,
  updateProductSeo,
  type ImageInput,
  type ListProductsParams,
  type ProductInput,
  type SeoInput,
} from "../products";

export const PRODUCTS_KEY = ["admin", "products"] as const;

export function useAdminProducts(params: ListProductsParams) {
  return useQuery({
    queryKey: [...PRODUCTS_KEY, params],
    queryFn: () => listAdminProducts(params),
    placeholderData: (prev) => prev, // keep table stable while paging/filtering
  });
}

export function useAdminProduct(id: string | undefined) {
  return useQuery({
    queryKey: [...PRODUCTS_KEY, "detail", id],
    queryFn: () => getAdminProduct(id!),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductInput) => createProduct(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<ProductInput>) => updateProduct(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
}

export function useDuplicateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => duplicateProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
}

export function useBulkUpdateProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof bulkUpdateProducts>[0]) =>
      bulkUpdateProducts(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
}

export function useSetProductImages(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (images: ImageInput[]) => setProductImages(id, images),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
}

export function useUpdateProductSeo(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (seo: SeoInput) => updateProductSeo(id, seo),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
}
