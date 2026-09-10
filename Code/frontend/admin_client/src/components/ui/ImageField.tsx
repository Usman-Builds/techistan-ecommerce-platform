"use client";

import Image from "next/image";
import { ImagePlus, Trash2 } from "lucide-react";
import { MediaUploader, type MediaItem } from "@/components/shared/MediaUploader";
import { cn } from "@/lib/utils";

/**
 * Single-image field: shows the current image with a Remove button, or an
 * uploader when empty.
 *
 * A wrapper over {@link MediaUploader} rather than a second uploader, so
 * signing, validation, progress and Cloudinary persistence all stay in one
 * place. What it adds is the ONE-IMAGE framing: the multi-image uploader's
 * reorder handles and "add another" affordance are wrong for a category poster,
 * and having the current image visible with a single Remove action is the whole
 * interaction here.
 *
 * `aspect` matches the shape the image will actually be used at, so an admin
 * uploading a banner sees a banner-shaped preview and notices a bad crop before
 * a shopper does.
 */
export function ImageField({
  publicId,
  url,
  onChange,
  folder,
  aspect = "square",
  alt = "",
  className,
  disabled,
}: {
  publicId: string | null;
  url: string | null;
  onChange: (value: { publicId: string | null; url: string | null }) => void;
  folder: string;
  aspect?: "square" | "portrait" | "banner";
  alt?: string;
  className?: string;
  disabled?: boolean;
}) {
  const ratio =
    aspect === "banner"
      ? "aspect-[16/5]"
      : aspect === "portrait"
        ? "aspect-[3/4]"
        : "aspect-square";

  if (url) {
    return (
      <div className={cn("space-y-2", className)}>
        <div
          className={cn(
            "relative overflow-hidden rounded-lg border border-border bg-muted",
            ratio,
          )}
        >
          <Image
            src={url}
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, 400px"
            className="object-cover"
          />
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ publicId: null, url: null })}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Remove image
        </button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <MediaUploader
        folder={folder}
        max={1}
        // `persist: false` — the image belongs to the record being edited, and
        // that record is saved by its own form. Writing a MediaAsset row here
        // would leave an orphan behind if the admin then cancels.
        persist={false}
        onChange={(items: MediaItem[]) => {
          const first = items[0];
          if (first) {
            onChange({ publicId: first.cloudinaryPublicId, url: first.url });
          }
        }}
      />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ImagePlus className="h-3.5 w-3.5" aria-hidden />
        {aspect === "banner"
          ? "Wide crop, roughly 16:5. Used across the top of the category page."
          : aspect === "portrait"
            ? "Portrait crop, roughly 3:4. Used on posters and rail cards."
            : "Square crop. Used on tiles and in the mega-menu."}
      </p>
    </div>
  );
}
