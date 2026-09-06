# 07 — Product Catalog (Products, Variants, Categories, Tags)

**Goal:** Build the full catalog domain in the **NestJS backend** — `product`, `category`, and `tag` modules exposing **public read** REST endpoints and **admin-guarded** CRUD (create / update / delete / duplicate / bulk-update), a variant builder (≤3 axes, ≤100 combinations), and an `AuditLog` entry on every admin mutation. Then build the **admin_client** UI: product editor, variant builder, category manager. Storefront rendering of products is **script 14** — keep all client work here admin-focused. (SRD FR-201–FR-208, FR-222, FR-802, FR-808.)

**Prerequisites:** Scripts `03` (Prisma schema: `Product`, `ProductVariant`, `ProductImage`, `Category`, `Tag`/`ProductTag`, `AuditLog`), `05` (`RolesGuard`, `@Roles`, `SUPER_ADMIN`/`ADMIN`), `06` (Cloudinary media module + `MediaUploader`). Backend runs on `:3000`; `admin_client` on `:3002` with its typed `apiClient` + TanStack Query wired (script `01`).

> ⚠️ **Architecture:** one **NestJS 11 REST** backend, two Next.js clients. Every backend feature is a module = **controller + service + DTOs** (`class-validator`). Public catalog reads are **unguarded `GET`**; all writes are **`POST`/`PATCH`/`DELETE` under `/admin/*`** guarded by `RolesGuard` + `@Roles(Role.ADMIN, Role.SUPER_ADMIN)`. Money is **integer cents**. No tRPC, no Auth.js, no Next API routes as backend. Package manager is **npm**.
>
> ⚠️ **Next.js 16 (admin_client):** before writing any client code, read the relevant guides in `Code/frontend/admin_client/node_modules/next/dist/docs/` (routing, forms/server-actions, data-fetching, metadata). Do **not** assume Next 13/14/15 conventions (see `00-BUILD-ORDER.md §7`).

---

## Tasks

### 1. (backend) `product` module — scaffold
- Generate under `src/modules/product/`: `product.module.ts`, `product.controller.ts` (public reads), `admin-product.controller.ts` (guarded writes), `product.service.ts`, and `dto/`.
- Register `ProductModule` in `AppModule`. Inject `PrismaService`; import the `media` module (script `06`) for image records and the shared `AuditModule`/audit helper (Task 8).
- Keep controllers thin (routing + validation); put slug generation, variant validation, status transitions, and duplication in the service.

### 2. (backend) Public product read endpoints — unguarded `GET`
On `product.controller.ts` (no guard):
- `GET /products` — paginated list. Query DTO (`ListProductsDto`): `page`, `pageSize` (cap, e.g. ≤60), `categorySlug?`, `tag?`, `minPrice?`, `maxPrice?` (cents), `status?`, `sort?` (`relevance` | `price_asc` | `price_desc` | `newest` | `best_selling` | `top_rated` — FR-222). **Public callers see `ACTIVE` only** — force `status = ACTIVE` regardless of input unless the request is admin-authenticated. Return `{ items, page, pageSize, total }` with each item's price range (min/max variant price) and primary image.
- `GET /products/:slug` — full product: ordered `ProductImage[]`, `ProductVariant[]`, category, tags, aggregate rating placeholder (reviews land in `13`), and related products (same category, capped). 404 if not found or not `ACTIVE` for public callers.
- Validate all query params with `class-validator` + `@Type` coercion (global `ValidationPipe` with `transform` is already on).

### 3. (backend) Admin product CRUD — guarded writes
On `admin-product.controller.ts`, decorate the controller (or each handler) with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN, Role.SUPER_ADMIN)`; route prefix `admin/products`:
- `POST /admin/products` — `CreateProductDto`: title, description (markdown/rich text), status (`DRAFT`|`ACTIVE`|`ARCHIVED`), `categoryId`, `tagIds[]`, SEO (`metaTitle?`, `metaDescription?`, `ogImage?`, `canonicalUrl?`), and `variants[]` (see Task 5). Slug auto-derived from title (Task 7), editable.
- `PATCH /admin/products/:id` — `UpdateProductDto` (all fields optional; `PartialType(CreateProductDto)`).
- `DELETE /admin/products/:id` — soft or hard delete per SRD; on delete also remove Cloudinary assets (best-effort, via media module — script `06`).
- `POST /admin/products/:id/duplicate` — deep-copy product + variants + image records + SEO into a new `DRAFT` with a fresh unique slug (FR-208).
- `POST /admin/products/bulk` — `BulkUpdateDto`: `{ ids: string[], action: 'activate' | 'archive' | 'delete' | 'setPrice', value? }` (FR-802). Run in a transaction; write one audit entry per affected id (or one batched entry with the id list).
- `PATCH /admin/products/:id/seo` — `UpdateSeoDto` (meta title/description, OG image, canonical).
- `PUT /admin/products/:id/images` — `SetImagesDto`: ordered array of `{ publicId, url, alt, position }` to persist image order + alt text (works with `MediaUploader` from `06`).

### 4. (backend) `category` module
- `src/modules/category/` — public `category.controller.ts` + guarded `admin-category.controller.ts` + service + DTOs.
- Public: `GET /categories/tree` — nested tree, **max 3 levels**; `GET /categories/:slug` — category + immediate children + breadcrumb.
- Admin (`@Roles(ADMIN, SUPER_ADMIN)`): `POST /admin/categories`, `PATCH /admin/categories/:id`, `DELETE /admin/categories/:id`, `POST /admin/categories/reorder` (`{ id, parentId, sortOrder }[]`).
- Service rules: validate parent — **no cycles**, **depth ≤ 3**; unique slug; **block deleting a category that has children or products** (require reassign or an explicit cascade flag). Category `image` via Cloudinary.

### 5. (backend) Variant builder — validation rules (service layer)
- A product declares **axes** (e.g. `Size`, `Color`) — **≤ 3 axes**. The Cartesian product of axis values yields variants — **≤ 100 combinations total**; reject with `400` (`BadRequestException`) otherwise.
- Each `ProductVariant`: `sku` (unique — regenerate/suffix on collision), `price` (cents), `compareAtPrice?` (cents), `stock`, `weight?`, `barcode?`, and `options` **JSON** (e.g. `{ "Size": "M", "Color": "Red" }`).
- Validate every variant's `options` keys/values against the declared axes (no unknown axis, no missing axis, no duplicate combination). Encapsulate as `validateVariantMatrix(axes, variants)` in `product.service.ts` with unit tests.

### 6. (backend) `tag` module
- `src/modules/tag/` — public `GET /tags` (list). Admin: `POST /admin/tags` (create), `POST /admin/tags/attach` / `POST /admin/tags/detach` (`{ productId, tagId }`) maintaining the `ProductTag` join. Unique tag slug.

### 7. (backend) Slugs, DTO validation & shared rules
- Slug helper: slugify title, ensure uniqueness by appending `-2`, `-3`, … on collision (products and categories).
- All DTOs use `class-validator` decorators (`@IsString`, `@IsInt`, `@Min(0)` for cents, `@IsEnum`, `@ValidateNested` + `@Type` for `variants[]`/`images[]`, `@IsArray`). Price/compareAt are **non-negative integers (cents)** — reject floats/decimals.
- Return typed response shapes; keep them in sync with `Code/shared/types` if that folder is used (optional, per `00 §6`).

### 8. (backend) AuditLog on every admin mutation (FR-808)
- Write an `AuditLog` row (`actorId`, `action`, `entityType`, `entityId`, `metadata` JSON, `createdAt`) on **create / update / delete / duplicate / bulk / reorder / attach / detach / setImages / updateSeo**.
- Implement once as a reusable **`AuditInterceptor`** (or an `AuditService.record()` called from each admin handler) so no admin write path is missed. `actorId` comes from the JWT user on the request. Reads are **never** audited.

### 9. (admin_client) API bindings + TanStack Query hooks
- Read `node_modules/next/dist/docs/` first (data-fetching / mutations in Next 16).
- Extend the typed `apiClient` (`src/lib/api/`, `fetch` wrapper, `credentials: 'include'`) with catalog calls: products (list/get/create/update/delete/duplicate/bulk/setImages/updateSeo), categories (tree/create/update/delete/reorder), tags (list/create/attach/detach).
- Wrap each in TanStack Query `useQuery`/`useMutation` hooks under `src/lib/api/hooks/`, with query-key invalidation on mutation success. Surface backend `class-validator` errors as inline form errors.

### 10. (admin_client) Product editor UI
Under the admin routes (e.g. `app/products/`):
- **List page** — table with search, status filter (Draft/Active/Archived), price/date columns, **bulk-select + bulk actions** (activate/archive/delete/set-price), pagination, "New product" and per-row Edit/Duplicate/Delete.
- **Create/Edit form** (`react-hook-form` + Zod, per `01`): title, slug (auto from title, editable, uniqueness hint), rich-text/markdown description, status, **category picker (tree)**, tags (multi-select/create), **SEO panel** (meta title/description, OG image, canonical).
- **Images**: reuse `MediaUploader` from script `06` (drag-reorder, alt-text) wired to `PUT /admin/products/:id/images`.
- Save as **Draft** / **Publish (Active)** / **Archive**. Optimistic UI where sensible; respect the shared theme + accessibility (WCAG 2.1 AA, keyboard-navigable).

### 11. (admin_client) Variant builder UI
- Define **axes** (add/remove, ≤3) with their values → **auto-generate the combination matrix** (≤100) → editable grid of price / compareAt / stock / SKU per variant.
- Enforce the same ≤3-axes / ≤100-combos limits client-side for UX, but the **backend is the source of truth** (Task 5). Show a clear error if the matrix exceeds limits; allow disabling individual combinations.

### 12. (admin_client) Category manager UI
- Tree view with **drag-reorder** and add child/parent, inline rename, image upload (Cloudinary), **depth-≤3 guard**, and a guard preventing deletion of categories with children/products (offer reassign). Wired to the category admin endpoints + `reorder`.

---

## Acceptance criteria
- [ ] (backend) An admin can `POST /admin/products` with **2 variant axes** → multiple variants, images, tags, category, and SEO — saved `ACTIVE`.
- [ ] (backend) `GET /products/:slug` returns the product with **ordered images** + variants + aggregate-rating placeholder; returns 404 for non-ACTIVE to public callers.
- [ ] (backend) `GET /products` filters (category/tag/price/status), sorts (FR-222), and paginates; public callers get **ACTIVE only**.
- [ ] (backend) Variant matrix rejects **>3 axes or >100 combinations** with `400`; unknown/missing/duplicate axis options rejected.
- [ ] (backend) `GET /categories/tree` enforces **max depth 3** and **no cycles**; a category with children/products cannot be deleted without reassign.
- [ ] (backend) Bulk actions + duplication work in a transaction; **every** admin mutation writes an `AuditLog`; reads write none.
- [ ] (backend) All write endpoints reject non-admin JWTs with `403` via `RolesGuard` + `@Roles` (verified with a `CUSTOMER` token).
- [ ] (admin_client) Product editor creates/edits products incl. variant builder, image reorder, SEO panel; bulk actions and duplicate work from the list.
- [ ] (admin_client) Category manager reorders via drag, enforces depth guard, and blocks unsafe deletes.
- [ ] `npm run build` (backend) and `npm run build`/typecheck (admin_client) pass.
