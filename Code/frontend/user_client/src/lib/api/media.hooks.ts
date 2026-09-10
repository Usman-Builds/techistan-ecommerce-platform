"use client";

/**
 * TanStack Query wrappers around the media API (script 06). The MediaUploader
 * drives the raw upload flow directly (it needs per-file progress), while pages
 * like the media library use these hooks for listing + cache invalidation.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  deleteMedia,
  listMedia,
  requestUploadSignature,
  saveMedia,
  type SaveMediaPayload,
} from "./media";

export const MEDIA_QUERY_KEY = ["media"] as const;

export function useMediaLibrary(search?: string) {
  return useQuery({
    queryKey: [...MEDIA_QUERY_KEY, search ?? ""],
    queryFn: () => listMedia(search),
  });
}

export function useCreateSignature() {
  return useMutation({
    mutationFn: (folder?: string) => requestUploadSignature(folder),
  });
}

export function useSaveMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveMediaPayload) => saveMedia(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: MEDIA_QUERY_KEY }),
  });
}

export function useDeleteMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (publicId: string) => deleteMedia(publicId),
    onSuccess: () => qc.invalidateQueries({ queryKey: MEDIA_QUERY_KEY }),
  });
}
