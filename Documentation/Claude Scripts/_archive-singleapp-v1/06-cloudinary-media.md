# 06 — File Storage & Media Library (Cloudinary)

**Goal:** All product images and media assets are stored on **Cloudinary**. Provide secure signed uploads, transformation helpers (WebP, thumbnails, responsive), and a reusable uploader + media library for the admin.

**Prerequisites:** Scripts `01`–`05`. Cloudinary account; `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` + `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` in `.env`.

---

## Tasks

### 1. Cloudinary client
- `src/lib/cloudinary.ts`: configured server-side `cloudinary` SDK instance. Never expose the API secret to the client.

### 2. Signed uploads (secure, direct-to-Cloudinary)
- tRPC `media` router, `adminProcedure`: `createUploadSignature` returns `{ signature, timestamp, apiKey, cloudName, folder }` scoped to a folder like `shopforge/products`.
- Client uploads directly to Cloudinary using the signature (keeps large files off our server — NFR-404). On success, persist a `ProductImage`/media record with `cloudinaryPublicId`, `url`, width, height.
- Enforce allowed formats + max size client- and server-side.

### 3. Transformation helpers
- `src/lib/media.ts` with helpers that build Cloudinary URLs:
  - `cldUrl(publicId, { w, h, crop, quality:'auto', format:'auto' })` → auto **WebP/AVIF**, `q_auto` (NFR-107).
  - `thumbnail(publicId)`, `responsiveSrcSet(publicId, widths[])` for `<img srcset>` / Next `<Image>` loader.
- Add a **custom Next Image loader** for Cloudinary so `next/image` serves optimized, responsive images.

### 4. Reusable uploader component
- `src/components/admin/MediaUploader.tsx` — drag-and-drop, multi-file, progress, preview, **drag-to-reorder** (FR-203, up to 10 images), alt-text editing, delete. Uses the signed-upload flow.

### 5. Media library (FR-807)
- `app/(admin)/admin/media/` — grid of uploaded assets with search, copy-URL, delete (also removes from Cloudinary via `destroy`). Reused by product editor.

### 6. Cleanup + integrity
- On product/image delete, delete the Cloudinary asset (best-effort, logged). Store `folder` conventions in a constant.

---

## Acceptance criteria
- [ ] Admin can upload an image; it lands in Cloudinary and a DB record is created.
- [ ] `next/image` renders Cloudinary images as WebP/AVIF with responsive `srcset`.
- [ ] Images can be reordered (persisted `position`) and deleted (removed from Cloudinary + DB).
- [ ] API secret never reaches the client (only signatures do).
- [ ] Media library lists, searches, and manages assets.
