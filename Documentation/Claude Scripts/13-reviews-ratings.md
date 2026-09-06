# 13 — Reviews & Ratings

**Goal:** A backend `review` module owning verified-purchaser product reviews with an admin moderation queue, denormalized aggregate ratings on products, helpful votes, and optional review photos (via the Cloudinary media module from 06) — exposed over REST with class-validator DTOs and RBAC-guarded moderation. The `user_client` gets review submission/reading, helpful voting, and photo upload on product pages; the `admin_client` gets the moderation UI. SRD FR-701–FR-705.

**Prerequisites:**
- Script `03` (schema), `07` (products), `11` (orders — used to verify purchase), `06` (Cloudinary media — for review photos), `05` (`RolesGuard`/`@Roles`).
- Verified-purchase gating is derived from **order data** (a delivered/completed order containing the product). Admin moderation writes are guarded by `RolesGuard` + `@Roles(ADMIN, SUPER_ADMIN)` (NFR-208).
- ⚠️ **Next.js 16 (both clients):** before writing any client code, read the relevant guides in `node_modules/next/dist/docs/` **inside each client** (`user_client` and `admin_client`) — routing, data fetching, forms/server actions, image. Do not assume Next 13/14/15 conventions (`00 §7`).

---

## Tasks

### 1. [backend] Prisma models (extend script 03 schema)
Add to `Code/backend/prisma/schema.prisma` (`npx prisma migrate dev`):
- `Review` — `productId`, `userId`, `orderId` (the purchase that verifies it), `rating` (1–5), `title`, `body`, `status` enum `ReviewStatus { PENDING APPROVED REJECTED }` (default `PENDING`), `helpfulCount` (denormalized, default 0), timestamps. **Unique** `(productId, userId)` — one review per user per product.
- `ReviewVote` — `reviewId`, `userId`, `createdAt`. Unique `(reviewId, userId)` — one helpful vote per user per review.
- `ReviewImage` — `reviewId`, plus the Cloudinary reference fields from the media module (06); cap 3 per review (enforced in the service).
- On `Product` (script 07): denormalized `ratingAverage` (int, e.g. ×100 or 0–5 float) + `ratingCount`, updated on approve/reject.

### 2. [backend] Scaffold the `review` module
- `src/modules/review/` with `review.module.ts`, `review.controller.ts`, `review.admin.controller.ts`, `review.service.ts`, `review.service.spec.ts`, and `dto/`.
- Register in `AppModule`; import `PrismaModule`, `OrderModule` (or `PrismaService` order queries) for verified-purchase checks, and the media module (06) for photos.
- DTOs (class-validator):
  - `CreateReviewDto` — `@IsUUID productId`, `@IsInt @Min(1) @Max(5) rating`, `@IsString @MaxLength title`, `@IsString body`, optional `@IsArray @ArrayMaxSize(3) mediaIds`.
  - `ListReviewsQueryDto` — `@IsUUID productId`, pagination, optional sort (newest / most-helpful / rating).
  - `ModerateReviewsQueryDto` — optional `@IsEnum(ReviewStatus) status`, pagination (admin queue).
  - `RejectReviewDto` — optional `@IsString reason` (recorded in the audit log / notification).

### 3. [backend] Submission — verified purchaser (FR-701)
- `POST /reviews` — `@UseGuards(JwtAuthGuard)` + `@Roles(CUSTOMER)` (or any authenticated user). In `ReviewService.create`:
  - Verify the user has a **delivered/completed order** (from 11) containing `productId`; reject (403) otherwise. Capture that `orderId` on the review.
  - Enforce one-review-per-user-per-product via the unique constraint (return 409 on duplicate).
  - Persist with `status = PENDING`. Attach up to 3 `ReviewImage`s from the supplied `mediaIds`.
  - Trigger an admin "new review" notification hook (script 16).

### 4. [backend] Moderation queue (FR-702) — RBAC guarded
`review.admin.controller.ts`, prefix `admin/`, class-level `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(ADMIN, SUPER_ADMIN)`:
- `GET /admin/reviews` — paginated queue filtered by `status` (default `PENDING`), including product + author context.
- `PATCH /admin/reviews/:id/approve` and `PATCH /admin/reviews/:id/reject` (`RejectReviewDto`).
- Reviews stay hidden from the storefront until `APPROVED`. Each moderation action writes an `AuditLog` (FR-808) and recomputes the product aggregate (Task 5).

### 5. [backend] Aggregate ratings (FR-703)
- On approve/reject, recompute the product's `ratingAverage` + `ratingCount` from **APPROVED** reviews only (single transactional update, or a computed helper the product read uses). Expose these on product-card and PDP read responses (07 / 14).

### 6. [backend] Helpful votes (FR-704)
- `POST /reviews/:id/helpful` — `@UseGuards(JwtAuthGuard)`. Insert a `ReviewVote` (unique per user+review; idempotent — second vote is a no-op or toggle) and increment `helpfulCount` atomically. Only allowed on `APPROVED` reviews.

### 7. [backend] Public read API + photos (FR-705)
- `GET /reviews?productId=…` — public, **APPROVED only**, paginated + sortable, returns rating distribution (counts per star), review bodies, author display name, `helpfulCount`, and up to 3 `ReviewImage` URLs (Cloudinary transforms from 06).
- Photo upload reuses the 06 signed-upload flow: the client uploads to Cloudinary → gets media ids → submits them in `CreateReviewDto.mediaIds`. The service validates ownership/count (≤3) before linking.

### 8. [user_client] Reviews on product pages
> First read `node_modules/next/dist/docs/` in `user_client` for the current App Router + forms/data-fetching APIs (Task preamble).
- Use the typed `apiClient` (`src/lib/api`, `fetch` + `credentials: 'include'`) and **TanStack Query** for reads/mutations.
- On the product page (`app/products/[slug]/`, a "Reviews" section): aggregate stars + rating distribution, paginated approved-review list, per-review photo thumbnails (gallery/lightbox), and a "Helpful" button (disabled once voted / for guests).
- **Write-a-review** form (React Hook Form + Zod mirroring `CreateReviewDto`): rating 1–5, title, body, and up to 3 photos via the Cloudinary uploader component (06). Show the form only to signed-in verified purchasers; surface the backend's 403 (not purchased) / 409 (already reviewed) messages clearly.
- Reflect that a submitted review is **PENDING** ("awaiting moderation") until approved. Final visual polish lands in script 14.

### 9. [admin_client] Moderation UI (RBAC-guarded)
> First read `node_modules/next/dist/docs/` in `admin_client` for the current App Router APIs (Task preamble).
- `app/reviews/` (moderation queue): filter by status (default Pending), view rating/title/body/photos + product + author, and **Approve** / **Reject** (with optional reason) actions via `apiClient` + TanStack Query (optimistic update + invalidation).
- Gate the route behind the admin session (redirect non-admins); the backend `RolesGuard` is the real enforcement. Functional here; polish in script 15.

---

## Acceptance criteria
- [ ] Only verified purchasers (a delivered/completed order containing the product) can submit; non-purchasers get 403 and duplicates get 409.
- [ ] New reviews are `PENDING` and hidden from the storefront until an admin approves them.
- [ ] Approving/rejecting recomputes the product's aggregate rating + count (APPROVED only), shown on cards + PDP.
- [ ] Helpful voting is one-per-user-per-review, atomic, and only on approved reviews.
- [ ] Review photos (≤3) upload via the 06 Cloudinary flow and display in the storefront gallery.
- [ ] Admin moderation endpoints are rejected (403) for non-admin tokens; each action writes an audit log.
- [ ] `user_client` shows aggregates + approved reviews and gates the write form to verified purchasers; `admin_client` can approve/reject from the queue.
