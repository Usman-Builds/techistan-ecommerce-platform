/**
 * Cloudinary folder + transformation helpers (script 06).
 *
 * These are **pure URL builders** — they hold no secret and never touch the SDK,
 * so they can be shared with the Next.js clients if desired. Delivery URLs use
 * `f_auto,q_auto` so Cloudinary auto-negotiates WebP/AVIF and quality (NFR-107).
 */

/**
 * Canonical upload folders. Centralised so folder strings aren't scattered; the
 * signature endpoint whitelists incoming `folder` against `ALLOWED_FOLDERS`.
 */
export const FOLDERS = {
  products: 'techistan/products',
  categories: 'techistan/categories',
  brands: 'techistan/brands',
  store: 'techistan/store',
  reviews: 'techistan/reviews',
} as const;

export type MediaFolder = (typeof FOLDERS)[keyof typeof FOLDERS];

export const ALLOWED_FOLDERS: string[] = Object.values(FOLDERS);

export const DEFAULT_FOLDER: string = FOLDERS.products;

/** Formats accepted for upload (enforced server-side in the DTO/service). */
export const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'avif'] as const;

/** Hard server-side size cap (FR-203 / NFR-404). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const BASE = 'https://res.cloudinary.com';

export interface CldUrlOptions {
  w?: number;
  h?: number;
  crop?: string; // e.g. 'limit', 'fill', 'thumb'
  quality?: string | number; // default 'auto'
  format?: string; // default 'auto' → WebP/AVIF negotiation
}

/**
 * Build a Cloudinary delivery URL for `publicId` under `cloudName`, with
 * automatic format/quality plus optional resize.
 */
export function cldUrl(
  cloudName: string,
  publicId: string,
  opts: CldUrlOptions = {},
): string {
  const { w, h, crop, quality = 'auto', format = 'auto' } = opts;
  const t: string[] = [`f_${format}`, `q_${quality}`];
  if (w) t.push(`w_${w}`);
  if (h) t.push(`h_${h}`);
  if (crop) t.push(`c_${crop}`);
  return `${BASE}/${cloudName}/image/upload/${t.join(',')}/${publicId}`;
}

/** Square-ish 200px thumbnail (auto format/quality). */
export function thumbnail(cloudName: string, publicId: string): string {
  return cldUrl(cloudName, publicId, { w: 200, h: 200, crop: 'fill' });
}

/**
 * `srcset` string for responsive `<img>` / `next/image` at the given widths.
 */
export function responsiveSrcSet(
  cloudName: string,
  publicId: string,
  widths: number[],
): string {
  return widths
    .map((w) => `${cldUrl(cloudName, publicId, { w, crop: 'limit' })} ${w}w`)
    .join(', ');
}
