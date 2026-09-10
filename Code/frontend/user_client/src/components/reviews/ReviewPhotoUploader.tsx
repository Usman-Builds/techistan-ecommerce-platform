"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, X, Loader2, AlertCircle } from "lucide-react";
import {
  requestUploadSignature,
  saveMedia,
  uploadToCloudinary,
  validateFile,
} from "@/lib/api/media";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 3;
const REVIEW_FOLDER = "techistan/reviews"; // whitelisted server-side (media.util)

type Photo = { id: string; url: string };
type Entry = {
  key: string;
  status: "uploading" | "done" | "error";
  previewUrl?: string;
  url?: string;
  mediaId?: string;
  error?: string;
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

/**
 * Review photo uploader (script 13, FR-705) — up to {@link MAX_PHOTOS} images via
 * the script-06 signed-upload flow. Reports the persisted MediaAsset **ids** back
 * to the form for `CreateReviewDto.mediaIds` (the backend re-validates the cap).
 */
export function ReviewPhotoUploader({
  onChange,
  className,
}: {
  onChange: (mediaIds: string[]) => void;
  className?: string;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const emit = useCallback(
    (next: Entry[]) => {
      onChange(
        next
          .filter((e): e is Entry & { mediaId: string } => e.status === "done" && !!e.mediaId)
          .map((e) => e.mediaId),
      );
    },
    [onChange],
  );

  const patch = useCallback(
    (key: string, updater: (e: Entry) => Entry) => {
      setEntries((prev) => {
        const next = prev.map((e) => (e.key === key ? updater(e) : e));
        emit(next);
        return next;
      });
    },
    [emit],
  );

  const uploadOne = useCallback(
    async (entry: Entry, file: File) => {
      try {
        const sig = await requestUploadSignature(REVIEW_FOLDER);
        const result = await uploadToCloudinary(file, sig);
        const saved = await saveMedia({
          cloudinaryPublicId: result.public_id,
          url: result.secure_url,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
          folder: sig.folder,
        });
        patch(entry.key, (e) => {
          if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
          return { ...e, status: "done", previewUrl: undefined, url: saved.url, mediaId: saved.id };
        });
      } catch (err) {
        patch(entry.key, (e) => ({
          ...e,
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        }));
      }
    },
    [patch],
  );

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      setGlobalError(null);
      const room = MAX_PHOTOS - entries.length;
      if (room <= 0) {
        setGlobalError(`You can add at most ${MAX_PHOTOS} photos.`);
        return;
      }
      const accepted = Array.from(fileList).slice(0, room);
      const created: { entry: Entry; file: File }[] = [];
      for (const file of accepted) {
        const err = validateFile(file);
        created.push({
          entry: {
            key: uid(),
            status: err ? "error" : "uploading",
            error: err ?? undefined,
            previewUrl: err ? undefined : URL.createObjectURL(file),
          },
          file,
        });
      }
      setEntries((prev) => [...prev, ...created.map((c) => c.entry)]);
      for (const { entry, file } of created) {
        if (entry.status === "uploading") void uploadOne(entry, file);
      }
    },
    [entries.length, uploadOne],
  );

  const remove = useCallback(
    (key: string) => {
      setEntries((prev) => {
        const t = prev.find((e) => e.key === key);
        if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl);
        const next = prev.filter((e) => e.key !== key);
        emit(next);
        return next;
      });
    },
    [emit],
  );

  const atMax = entries.length >= MAX_PHOTOS;

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        disabled={atMax}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-dashed border-input px-3 py-2 text-sm transition-colors",
          atMax
            ? "cursor-not-allowed text-muted-foreground"
            : "hover:border-primary/60 hover:bg-muted/40",
        )}
      >
        <UploadCloud className="h-4 w-4" aria-hidden />
        {atMax ? `Photo limit reached (${MAX_PHOTOS})` : "Add photos"}
      </button>
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

      {globalError && (
        <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden /> {globalError}
        </p>
      )}

      {entries.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {entries.map((e) => (
            <li
              key={e.key}
              className="relative h-16 w-16 overflow-hidden rounded-md border border-border bg-muted"
            >
              {e.status === "error" ? (
                <div className="flex h-full w-full items-center justify-center" title={e.error}>
                  <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
                </div>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={e.url ?? e.previewUrl}
                    alt="Review photo"
                    className={cn(
                      "h-full w-full object-cover",
                      e.status === "uploading" && "opacity-60",
                    )}
                  />
                  {e.status === "uploading" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Loader2 className="h-4 w-4 animate-spin text-white" aria-hidden />
                    </div>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => remove(e.key)}
                aria-label="Remove photo"
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-destructive"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type { Photo };
