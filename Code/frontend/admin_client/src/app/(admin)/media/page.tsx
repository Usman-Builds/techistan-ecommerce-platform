"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Check, Trash2, Search, Loader2 } from "lucide-react";
import {
  MEDIA_QUERY_KEY,
  useDeleteMedia,
  useMediaLibrary,
} from "@/lib/api/media.hooks";
import { MediaUploader, type MediaItem } from "@/components/shared/MediaUploader";
import { cn } from "@/lib/utils";

/**
 * Admin media library (FR-807). Lists Cloudinary-backed assets, supports search,
 * copy-URL and delete (removes from Cloudinary AND the DB via DELETE /media).
 * New uploads flow through the shared MediaUploader; on completion the list is
 * refetched. Reused by the product editor in script 07.
 */
export default function MediaLibraryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data: assets, isLoading, isError } = useMediaLibrary(search);
  const del = useDeleteMedia();
  const [copied, setCopied] = useState<string | null>(null);
  const lastCount = useRef(0);

  const copyUrl = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  // Refetch the grid whenever the uploader reports a net-new asset.
  const onUploaderChange = (items: MediaItem[]) => {
    if (items.length > lastCount.current) {
      qc.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
    }
    lastCount.current = items.length;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold">Media Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload and manage images. Files upload directly to Cloudinary.
        </p>
      </div>

      {/* Upload */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Upload images</h2>
        <MediaUploader folder="techistan/store" onChange={onUploaderChange} />
      </section>

      {/* Library */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">All assets</h2>
          <div className="relative w-full max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, alt or folder"
              aria-label="Search media"
              className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : isError ? (
          <p className="py-12 text-sm text-destructive">
            Could not load the media library.
          </p>
        ) : !assets || assets.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {search
              ? "No assets match your search."
              : "No media yet. Upload something above."}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {assets.map((asset) => (
              <li
                key={asset.id}
                className="group overflow-hidden rounded-lg border border-border bg-card"
              >
                <div className="relative aspect-square w-full bg-muted">
                  <Image
                    src={asset.url}
                    alt={asset.alt ?? asset.cloudinaryPublicId}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover"
                  />
                </div>
                <div className="space-y-2 p-2">
                  <p
                    className="truncate text-xs text-muted-foreground"
                    title={asset.cloudinaryPublicId}
                  >
                    {asset.cloudinaryPublicId}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => copyUrl(asset.url, asset.id)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs font-medium transition-colors hover:bg-muted"
                    >
                      {copied === asset.id ? (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" aria-hidden /> Copy URL
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => del.mutate(asset.cloudinaryPublicId)}
                      disabled={del.isPending}
                      aria-label="Delete asset"
                      className={cn(
                        "inline-flex items-center justify-center rounded border border-border bg-background p-1.5 text-muted-foreground transition-colors hover:border-destructive hover:text-destructive",
                        del.isPending && "opacity-50",
                      )}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
