# 06 — File Storage & Media (Cloudinary, backend-signed direct uploads)

**Goal:** All product/media assets live on **Cloudinary**. The **NestJS backend** owns a `media` module that issues **signed upload signatures**; clients upload files **directly to Cloudinary** with that signature (large files never transit our API — NFR-404), then persist the resulting asset via the backend. Provide transformation helpers (auto WebP/AVIF, thumbnails, responsive), a reusable `MediaUploader` component (drag-reorder, ≤10 images) in the clients, a Cloudinary `next/image` loader, and cleanup-on-delete. **Cloudinary replaces the SRD's S3/R2** (`00 §3`).

**Prerequisites:** Scripts `01`–`05` complete (auth + `RolesGuard`/`@Roles`, `role` on `User`, Prisma schema incl. `ProductImage`). A Cloudinary account. Backend `.env`: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Each client `.env.local`: `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`.

> ⚠️ **Next.js 16 caveat (`00 §7`).** Before writing the `next/image` loader or config, read `node_modules/next/dist/docs/` in each client for **`next/image`** and **`images` config** (custom `loader` / `loaderFile`, `remotePatterns`) for the installed version. Do not assume Next 13/14/15 image conventions.

---

## Tasks

> Track labels: **[backend]** = `Code/backend`, **[user_client]** / **[admin_client]** = the two Next.js apps, **[both clients]** = do the identical step in each.

### 1. [backend] Config + Cloudinary provider
- Add `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` to `src/config/configuration.ts` and the Joi schema in `src/config/validation.ts` (required in prod). Document them in `.env.example`.
- Install the SDK in the backend: `npm i cloudinary`.
- Create `src/modules/media/cloudinary.provider.ts` — a NestJS provider that calls `cloudinary.config({...})` from `ConfigService` and exports the configured `v2` instance (injected token `CLOUDINARY`). The **API secret stays server-side only**; it is never returned to clients.

### 2. [backend] `media` module — signed uploads
Generate `src/modules/media/` with `media.module.ts`, `media.controller.ts`, `media.service.ts`, and `dto/`.

- **`POST /media/upload-signature`** — guarded by `JwtAuthGuard` + `@Roles(ADMIN, SUPER_ADMIN)` + `RolesGuard`. Body DTO (class-validator): `folder?` (whitelist against allowed folders, default `shopforge/products`), optional `publicId`. `MediaService.createUploadSignature()` builds the params to sign (`timestamp`, `folder`, allowed `eager`/`transformation` if any) and returns:
  ```jsonc
  { "signature": "...", "timestamp": 1700000000, "apiKey": "...", "cloudName": "...", "folder": "shopforge/products" }
  ```
  Sign with `cloudinary.utils.api_sign_request(params, apiSecret)`. Only `apiKey`/`cloudName` (both public) leave the server — never the secret.
- **`POST /media`** — persist a confirmed upload. DTO: `cloudinaryPublicId`, `url` (or `secureUrl`), `width`, `height`, `format`, `bytes`, `alt?`, and the owning `productId?`. Service validates the payload and creates the `ProductImage` (or a generic `MediaAsset`) row with a `position` for ordering. Optionally re-verify the asset via `cloudinary.api.resource(publicId)` to prevent spoofed records.
- **`DELETE /media/:publicId`** — `@Roles(ADMIN, SUPER_ADMIN)`; deletes the DB row **and** calls `cloudinary.uploader.destroy(publicId)` (best-effort, logged — see Task 6).
- Enforce **allowed formats + max size** in the DTO/service (server-side) as well as client-side. Register `MediaModule` in `app.module.ts`.

### 3. [backend] Transformation helpers + folder conventions
- `src/modules/media/media.util.ts`:
  - `cldUrl(publicId, { w, h, crop, quality='auto', format='auto' })` → builds a delivery URL with `f_auto,q_auto` for automatic **WebP/AVIF** and `q_auto` (NFR-107).
  - `thumbnail(publicId)` and `responsiveSrcSet(publicId, widths[])` (for `srcset`).
- A `FOLDERS` constant (e.g. `products`, `categories`, `store`) so folder strings aren't scattered; the signature endpoint whitelists against it.
- These are pure URL builders (no secret) so they can also be shared with the clients if desired.

### 4. [both clients] Cloudinary `next/image` loader
- Add `src/lib/cloudinary-loader.ts` — a custom loader that returns `https://res.cloudinary.com/<NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME>/image/upload/f_auto,q_auto,w_{width}/<publicId>`.
- Wire it in `next.config.ts` (keep the existing `reactCompiler: true`): set `images.loaderFile` to the loader (or configure `images.remotePatterns` for `res.cloudinary.com` if using `<Image>` with full URLs). **Confirm the exact field names against the Next 16 image docs** before writing. So `next/image` serves optimized, responsive Cloudinary images with `srcset`.

### 5. [both clients] API client methods for media
- In each client's typed `apiClient` (`src/lib/api/`, `credentials:'include'` from `01`), add:
  - `requestUploadSignature(folder?)` → `POST /media/upload-signature`.
  - `saveMedia(payload)` → `POST /media`; `deleteMedia(publicId)` → `DELETE /media/:publicId`.
- Wrap them in TanStack Query hooks (`useCreateSignature`, `useSaveMedia`, `useDeleteMedia`).

### 6. [both clients] `MediaUploader` component (FR-203)
Primary home is **admin_client** (product editor, script `07`); build it generically so **user_client** can reuse it for review photos (script `13`). Place at `src/components/shared/MediaUploader.tsx` (or `components/admin/` if admin-only).
- Drag-and-drop + file picker, **multi-file**, per-file progress, thumbnail preview, **drag-to-reorder** (persists `position`), alt-text editing, remove. **Cap at ≤10 images** (FR-203) — enforce client-side.
- Flow per file: (1) `requestUploadSignature()` from the backend → (2) `POST` the file **directly to** `https://api.cloudinary.com/v1_1/<cloudName>/image/upload` as `FormData` (`file`, `api_key`, `timestamp`, `folder`, `signature`) → (3) on success, `saveMedia()` to persist `{ cloudinaryPublicId, url, width, height, ... }` on the backend.
- Validate allowed formats (jpeg/png/webp/avif) and max size before uploading; show inline errors. Fully accessible + keyboard-operable, themed with the semantic tokens from script `02`.

### 7. [admin_client] Media library (FR-807)
- `src/app/media/page.tsx` (Client Component) — grid of uploaded assets with search, copy-URL, and delete (delete removes from Cloudinary **and** DB via `DELETE /media/:publicId`). Reused by the product editor in script `07`.

### 8. [backend] Cleanup + integrity
- On product/image delete (here and in later product flows), delete the Cloudinary asset via `uploader.destroy` — **best-effort, logged** (a failed destroy must not block the DB delete; log for a reconcile job).
- Consider a periodic reconcile/orphan-scan as a later enhancement (note it; do not build now).

---

## Acceptance criteria
- [ ] Admin obtains a signature from `POST /media/upload-signature` (role-guarded) and the file uploads **directly to Cloudinary**; a `ProductImage`/`MediaAsset` row is then created via `POST /media`.
- [ ] The Cloudinary **API secret never reaches any client** — only `signature`, `timestamp`, `apiKey`, `cloudName`, `folder` do.
- [ ] `next/image` renders Cloudinary images as WebP/AVIF with responsive `srcset` in both clients (loader verified against Next 16 docs).
- [ ] `MediaUploader` uploads multiple images, enforces the **≤10** cap, reorders (persisted `position`), edits alt text, and deletes.
- [ ] Deleting an image removes it from **both** Cloudinary and the DB; a failed Cloudinary destroy is logged, not fatal.
- [ ] Admin media library lists, searches, copies URLs, and manages assets.
- [ ] `media` endpoints enforce `@Roles(ADMIN, SUPER_ADMIN)` via `RolesGuard`; DTOs validate formats/size server-side.
