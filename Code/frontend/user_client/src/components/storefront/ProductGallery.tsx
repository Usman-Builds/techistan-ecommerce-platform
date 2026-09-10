"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductImage } from "@/lib/api/products";

/**
 * PDP image gallery (script 14). Main image with hover-zoom + a thumbnail strip.
 * Keyboard operable: thumbnails are focusable buttons, and Left/Right arrows on
 * the gallery move the active image. Each image carries its alt text.
 */
export function ProductGallery({
  images,
  title,
}: {
  images: ProductImage[];
  title: string;
}) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
        <ImageOff className="h-10 w-10" aria-hidden />
        <span className="sr-only">No image available</span>
      </div>
    );
  }

  const current = images[Math.min(active, images.length - 1)];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setActive((i) => (i + 1) % images.length);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((i) => (i - 1 + images.length) % images.length);
    }
  };

  return (
    <div
      className="flex flex-col gap-3"
      onKeyDown={onKeyDown}
      role="group"
      aria-label={`${title} image gallery`}
    >
      <div className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
        <Image
          key={current.id}
          src={current.url}
          alt={current.alt ?? title}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-contain transition-transform duration-300 group-hover:scale-110"
        />
      </div>

      {images.length > 1 && (
        <ul className="flex flex-wrap gap-2" role="tablist" aria-label="Thumbnails">
          {images.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`View image ${i + 1}`}
                onClick={() => setActive(i)}
                className={cn(
                  "relative h-16 w-16 overflow-hidden rounded-md border bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  i === active ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/40",
                )}
              >
                <Image
                  src={img.url}
                  alt={img.alt ?? `${title} thumbnail ${i + 1}`}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
