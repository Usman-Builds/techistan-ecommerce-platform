/**
 * Server-safe Cloudinary URL helpers for SEO/social images (script 17). Unlike
 * `cloudinary-loader.ts` (which is `"use client"` and wired into next/image),
 * this module has no client directive, so it can be imported from server
 * `generateMetadata` and JSON-LD builders.
 *
 * Accepts either a bare Cloudinary public_id or an already-absolute URL:
 *   • a `res.cloudinary.com` URL → the transform is injected after `/upload/`.
 *   • any other absolute URL → returned unchanged (can't safely transform it).
 *   • a bare public_id → composed against NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.
 */
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

function withTransform(
  src: string,
  transform: string,
): string | undefined {
  if (src.includes("res.cloudinary.com")) {
    return src.replace("/image/upload/", `/image/upload/${transform}/`);
  }
  if (/^https?:\/\//i.test(src)) return src;
  if (!CLOUD_NAME) return undefined;
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transform}/${src}`;
}

/** Social-card image: 1200×630, cropped to fill (OpenGraph/Twitter default). */
export function ogImageUrl(src: string | null | undefined): string | undefined {
  if (!src) return undefined;
  return withTransform(src, "f_auto,q_auto,c_fill,g_auto,w_1200,h_630");
}

/** Absolute product image for JSON-LD `image` (bounded, uncropped). */
export function structuredImageUrl(
  src: string | null | undefined,
): string | undefined {
  if (!src) return undefined;
  return withTransform(src, "f_auto,q_auto,c_limit,w_1200");
}
