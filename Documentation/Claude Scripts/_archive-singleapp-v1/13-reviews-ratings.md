# 13 — Reviews & Ratings

**Goal:** Verified-purchaser reviews with admin moderation, aggregate ratings on products, helpful votes, and optional review photos. SRD FR-701–FR-705.

**Prerequisites:** Scripts `07` (products), `11` (orders — to verify purchase), `06` (media — for review photos).

---

## Tasks

### 1. Submission (FR-701)
- tRPC `reviews.create` (`customerProcedure`): only allow if the user has a **completed/delivered order** containing that product (verified purchaser). One review per user per product.
- Fields: rating 1–5, title, body. Zod-validated. Status defaults to **PENDING**.

### 2. Moderation (FR-702)
- Reviews require admin approval before publishing. tRPC `reviewsAdmin` (`adminProcedure`): `list` (filter by status), `approve`, `reject`. Writes AuditLog. New submission triggers an admin notification (script `16`).

### 3. Aggregates (FR-703)
- Maintain per-product aggregate rating + count (denormalized field updated on approve/reject, or computed view). Show on product cards + PDP.

### 4. Helpful votes (FR-704, Could)
- `reviews.markHelpful` — one vote per user per review; increment `helpfulCount`.

### 5. Review photos (FR-705, Could)
- Up to 3 images per review via the Cloudinary uploader (`ReviewImage`), shown in a gallery.

### 6. UI
- PDP "Reviews" tab: aggregate stars + distribution, list (approved only, paginated), write-review form (gated to verified purchasers), helpful button, photo thumbnails. Styling finalized in script `14`.

---

## Acceptance criteria
- [ ] Only verified purchasers can submit; duplicate reviews blocked.
- [ ] New reviews are PENDING and hidden until an admin approves them.
- [ ] Approving updates the product aggregate rating shown on cards + PDP.
- [ ] Helpful voting is one-per-user and increments the count.
- [ ] Review photos upload (max 3) and display.
