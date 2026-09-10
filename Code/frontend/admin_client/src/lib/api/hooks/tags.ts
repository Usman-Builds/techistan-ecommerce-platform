"use client";

/** TanStack Query hooks for tags (script 07). */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  attachTag,
  createTag,
  detachTag,
  listTags,
} from "../tags";
import { PRODUCTS_KEY } from "./products";

export const TAGS_KEY = ["tags"] as const;

export function useTags() {
  return useQuery({ queryKey: TAGS_KEY, queryFn: listTags });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; slug?: string }) => createTag(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: TAGS_KEY }),
  });
}

export function useAttachTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { productId: string; tagId: string }) =>
      attachTag(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TAGS_KEY });
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}

export function useDetachTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { productId: string; tagId: string }) =>
      detachTag(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TAGS_KEY });
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}
