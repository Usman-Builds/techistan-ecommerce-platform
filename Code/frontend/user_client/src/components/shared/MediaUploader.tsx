"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { UploadCloud, X, GripVertical, AlertCircle, Loader2 } from "lucide-react";
import {
  MAX_IMAGES,
  requestUploadSignature,
  saveMedia,
  uploadToCloudinary,
  validateFile,
  type SavedMedia,
} from "@/lib/api/media";
import { cn } from "@/lib/utils";

/** A finalized image the uploader reports back to its parent. */
export type MediaItem = {
  cloudinaryPublicId: string;
  url: string;
  alt: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  position: number;
};

/** Internal per-file entry (covers in-flight + finished + failed uploads). */
type Entry = {
  id: string;
  status: "uploading" | "done" | "error";
  progress: number;
  error?: string;
  previewUrl?: string; // object URL while uploading
  cloudinaryPublicId?: string;
  url?: string;
  alt: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
};

type Props = {
  /** Cloudinary folder (whitelisted server-side). Defaults to products. */
  folder?: string;
  /** When set, each upload is attached to this product server-side. */
  productId?: string;
  /** Call POST /media to persist (default true). Set false to only upload. */
  persist?: boolean;
  /** Pre-existing images (e.g. editing a product). */
  initialItems?: MediaItem[];
  /** Fires whenever the ordered list of finished images changes. */
  onChange?: (items: MediaItem[]) => void;
  /** Hard cap (FR-203: ≤10). */
  max?: number;
  className?: string;
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

function toEntry(item: MediaItem): Entry {
  return {
    id: uid(),
    status: "done",
    progress: 100,
    cloudinaryPublicId: item.cloudinaryPublicId,
    url: item.url,
    alt: item.alt,
    width: item.width,
    height: item.height,
    format: item.format,
    bytes: item.bytes,
  };
}

export function MediaUploader({
  folder,
  productId,
  persist = true,
  initialItems = [],
  onChange,
  max = MAX_IMAGES,
  className,
}: Props) {
  const [entries, setEntries] = useState<Entry[]>(() =>
    initialItems.map(toEntry),
  );
  const [dragOver, setDragOver] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Emit the ordered finished items to the parent, re-numbering positions.
  const emit = useCallback(
    (next: Entry[]) => {
      if (!onChange) return;
      const items: MediaItem[] = next
        .filter((e) => e.status === "done" && e.cloudinaryPublicId && e.url)
        .map((e, i) => ({
          cloudinaryPublicId: e.cloudinaryPublicId!,
          url: e.url!,
          alt: e.alt,
          width: e.width,
          height: e.height,
          format: e.format,
          bytes: e.bytes,
          position: i,
        }));
      onChange(items);
    },
    [onChange],
  );

  const patch = useCallback(
    (id: string, updater: (e: Entry) => Entry) => {
      setEntries((prev) => {
        const next = prev.map((e) => (e.id === id ? updater(e) : e));
        emit(next);
        return next;
      });
    },
    [emit],
  );

  const uploadOne = useCallback(
    async (entry: Entry, file: File) => {
      try {
        const sig = await requestUploadSignature(folder);
        const result = await uploadToCloudinary(file, sig, (percent) =>
          patch(entry.id, (e) => ({ ...e, progress: percent })),
        );

        let saved: SavedMedia | null = null;
        if (persist) {
          saved = await saveMedia({
            cloudinaryPublicId: result.public_id,
            url: result.secure_url,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
            alt: entry.alt || undefined,
            folder: sig.folder,
            productId,
          });
        }

        patch(entry.id, (e) => {
          if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
          return {
            ...e,
            status: "done",
            progress: 100,
            previewUrl: undefined,
            cloudinaryPublicId: saved?.cloudinaryPublicId ?? result.public_id,
            url: saved?.url ?? result.secure_url,
            width: saved?.width ?? result.width,
            height: saved?.height ?? result.height,
            format: saved?.format ?? result.format,
            bytes: saved?.bytes ?? result.bytes,
          };
        });
      } catch (err) {
        patch(entry.id, (e) => ({
          ...e,
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        }));
      }
    },
    [folder, persist, productId, patch],
  );

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      setGlobalError(null);
      const files = Array.from(fileList);

      const doneCount = entries.length;
      const room = max - doneCount;
      if (room <= 0) {
        setGlobalError(`You can upload at most ${max} images.`);
        return;
      }
      const accepted = files.slice(0, room);
      if (files.length > room) {
        setGlobalError(`Only ${max} images allowed — extra files were skipped.`);
      }

      const newEntries: { entry: Entry; file: File }[] = [];
      for (const file of accepted) {
        const validationError = validateFile(file);
        const entry: Entry = {
          id: uid(),
          status: validationError ? "error" : "uploading",
          progress: 0,
          error: validationError ?? undefined,
          previewUrl: validationError ? undefined : URL.createObjectURL(file),
          alt: "",
        };
        newEntries.push({ entry, file });
      }

      setEntries((prev) => [...prev, ...newEntries.map((n) => n.entry)]);
      // Kick off uploads for the valid ones.
      for (const { entry, file } of newEntries) {
        if (entry.status === "uploading") void uploadOne(entry, file);
      }
    },
    [entries.length, max, uploadOne],
  );

  const remove = useCallback(
    (id: string) => {
      setEntries((prev) => {
        const target = prev.find((e) => e.id === id);
        if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
        const next = prev.filter((e) => e.id !== id);
        emit(next);
        return next;
      });
    },
    [emit],
  );

  const setAlt = useCallback(
    (id: string, alt: string) => patch(id, (e) => ({ ...e, alt })),
    [patch],
  );

  // ---- drag-to-reorder (native HTML5) ----
  const onDrop = useCallback(
    (targetIndex: number) => {
      const from = dragIndex.current;
      dragIndex.current = null;
      if (from === null || from === targetIndex) return;
      setEntries((prev) => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(targetIndex, 0, moved);
        emit(next);
        return next;
      });
    },
    [emit],
  );

  const atMax = entries.length >= max;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-disabled={atMax}
        onClick={() => !atMax && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !atMax) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!atMax) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!atMax && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
          atMax
            ? "cursor-not-allowed border-border bg-muted/40 text-muted-foreground"
            : "cursor-pointer border-input hover:border-primary/60 hover:bg-muted/40",
          dragOver && "border-primary bg-primary/5",
        )}
      >
        <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden />
        <div className="text-sm font-medium text-foreground">
          {atMax
            ? `Image limit reached (${max})`
            : "Drag & drop images, or click to browse"}
        </div>
        <div className="text-xs text-muted-foreground">
          JPEG, PNG, WebP or AVIF · up to 10 MB · max {max} images
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {globalError && (
        <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {globalError}
        </p>
      )}

      {/* Thumbnails / reorder list */}
      {entries.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {entries.map((e, index) => (
            <li
              key={e.id}
              draggable={e.status === "done"}
              onDragStart={() => (dragIndex.current = index)}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={() => onDrop(index)}
              className={cn(
                "group relative overflow-hidden rounded-lg border border-border bg-card",
                e.status === "done" && "cursor-move",
              )}
            >
              <div className="relative aspect-square w-full bg-muted">
                {e.status === "done" && e.url ? (
                  <Image
                    src={e.url}
                    alt={e.alt || "Uploaded image"}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                    className="object-cover"
                  />
                ) : e.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.previewUrl}
                    alt="Preview"
                    className="h-full w-full object-cover opacity-70"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <AlertCircle className="h-6 w-6 text-destructive" aria-hidden />
                  </div>
                )}

                {/* Progress / error overlay */}
                {e.status === "uploading" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 text-white">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    <span className="text-xs font-medium">{e.progress}%</span>
                  </div>
                )}

                {/* Reorder handle */}
                {e.status === "done" && (
                  <div className="absolute left-1.5 top-1.5 rounded bg-black/50 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <GripVertical className="h-4 w-4" aria-hidden />
                  </div>
                )}

                {/* Position badge */}
                {e.status === "done" && (
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {index + 1}
                  </span>
                )}

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => remove(e.id)}
                  aria-label="Remove image"
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-destructive"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>

              {/* Alt text / error */}
              <div className="p-2">
                {e.status === "error" ? (
                  <p className="text-xs text-destructive" role="alert">
                    {e.error}
                  </p>
                ) : (
                  <input
                    type="text"
                    value={e.alt}
                    onChange={(ev) => setAlt(e.id, ev.target.value)}
                    placeholder="Alt text"
                    disabled={e.status !== "done"}
                    aria-label="Image alt text"
                    className="w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
