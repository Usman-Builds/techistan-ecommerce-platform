# 07 — Product Catalog (Products, Variants, Categories, Tags)

**Goal:** Full catalog domain — products with variants/images/SEO, a hierarchical category tree, and tags — exposed via tRPC with admin CRUD and public read APIs. Storefront rendering of these comes in script `14`.

**Prerequisites:** Scripts `03` (schema), `06` (media). Reference SRD FR-201–FR-208.

---

## Tasks

### 1. Services layer
`src/server/services/product.service.ts`, `category.service.ts` — encapsulate business logic (slug generation, variant combination validation ≤100/≤3 axes, status transitions, duplication).

### 2. tRPC routers

**`products` (public reads):**
- `list` — paginated, filter by category/tag/status(ACTIVE only for public)/price, sort (relevance/price asc-desc/newest/best-selling/top-rated — FR-222).
- `getBySlug` — full product with variants, images (ordered), aggregate rating, related products.

**`productsAdmin` (`adminProcedure`):**
- `create`, `update`, `delete`, `duplicate` (FR-208), `bulkUpdate` (activate/archive/delete/price update — FR-802), `setImages` (order + alt), `updateSeo`.
- Zod schemas shared with the admin forms. Money in cents.
- Write an `AuditLog` entry on each mutation (FR-808).

**`categories`:**
- Public `tree` (nested, max 3 levels). Admin `create/update/delete/reorder` with parent validation (no cycles, depth ≤ 3).

**`tags`:** admin create/list/attach/detach.

### 3. Product editor (admin UI)
`app/(admin)/admin/products/` :
- List with search, status filter, bulk actions, pagination.
- Create/Edit form: title, slug (auto from title, editable), rich-text description, status, category picker (tree), tags, SEO panel (meta title/description, OG image, canonical), pricing/inventory per variant.
- **Variant builder**: define axes (e.g. Size, Color) → auto-generate combinations → edit price/compareAt/stock/SKU per variant.
- **Images**: `MediaUploader` from script `06` (reorder, alt).
- Save as Draft / Publish (Active) / Archive.

### 4. Category manager (admin UI)
`app/(admin)/admin/categories/` — tree view with drag-reorder, add child/parent, image upload, depth guard.

### 5. Validation & rules
- Slugs unique; regenerate collisions with suffixes.
- Variant options JSON validated against declared axes.
- Prevent deleting a category with children/products (or reassign).

---

## Acceptance criteria
- [ ] Admin can create a product with 2 variant axes, multiple variants, images, tags, category, and SEO — saved as Active.
- [ ] `products.getBySlug` returns the product with ordered images + aggregate rating placeholder.
- [ ] `products.list` filters, sorts, and paginates correctly (ACTIVE only for public).
- [ ] Category tree enforces max depth 3 and no cycles.
- [ ] Bulk actions + product duplication work; each mutation writes an audit log.
- [ ] `pnpm typecheck` passes.
