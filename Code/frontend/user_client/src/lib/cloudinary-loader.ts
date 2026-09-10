"use client";

/**
 * Custom `next/image` loader for Cloudinary (script 06). Verified against the
 * Next 16 image docs: `next.config.ts` sets `images.loader: "custom"` +
 * `images.loaderFile` pointing here, and the default export receives
 * `{ src, width, quality }` and returns a URL. `f_auto` lets Cloudinary serve
 * WebP/AVIF; `q_auto` picks quality; `c_limit` never upscales past the source.
 *
 * `src` may be:
 *  - a bare Cloudinary public_id (e.g. `techistan/products/abc`),
 *  - a full `res.cloudinary.com` URL,
 *  - or ANY other absolute URL (the demo seed stores real Unsplash photo URLs,
 *    and an imported catalog may reference a third-party CDN).
 *
 * The last case matters: a custom loader bypasses Next's optimizer entirely, so
 * `images.remotePatterns` does NOT apply and an absolute URL can be returned
 * as-is. Treating one as a Cloudinary public_id instead would produce a broken
 * `res.cloudinary.com/<cloud>/image/upload/…/https://…` URL, so absolute URLs
 * are passed through. `images.unsplash.com` additionally understands `w`/`q`
 * query params, so those are set from the loader args to keep the responsive
 * srcset meaningful rather than shipping the full-size original at every width.
 */

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_MARKER = "/image/upload/";

type LoaderArgs = { src: string; width: number; quality?: number };

export default function cloudinaryLoader({
  src,
  width,
  quality,
}: LoaderArgs): string {
  const transform = [
    "f_auto",
    "c_limit",
    `w_${width}`,
    `q_${quality ?? "auto"}`,
  ].join(",");

  // Full Cloudinary URL → inject the transformation right after /image/upload/.
  if (src.includes("res.cloudinary.com") && src.includes(UPLOAD_MARKER)) {
    const [prefix, rest] = src.split(UPLOAD_MARKER);
    return `${prefix}${UPLOAD_MARKER}${transform}/${rest}`;
  }

  // Inline data / blob sources (upload previews) are already final.
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;

  // Any other absolute URL is served from its own origin, untouched — except
  // Unsplash, which can resize for us.
  if (/^https?:\/\//i.test(src)) {
    if (!src.includes("images.unsplash.com")) return src;
    try {
      const url = new URL(src);
      url.searchParams.set("w", String(width));
      url.searchParams.set("q", String(quality ?? 75));
      url.searchParams.set("auto", "format");
      return url.toString();
    } catch {
      return src;
    }
  }

  // Otherwise treat src as a Cloudinary public_id.
  const publicId = src.replace(/^\/+/, "");
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transform}/${publicId}`;
}
