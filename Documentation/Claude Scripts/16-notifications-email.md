# 16 — Notifications & Email

**Goal:** Branded transactional emails (Resend + React Email) sent from the **NestJS backend**, admin notifications backed by the `Notification` entity, and an in-app notification center exposed over REST and consumed by **both** Next.js clients. This wires up every email/notification hook stubbed in earlier scripts. SRD FR-901–FR-905.

**Prerequisites:**
- Script `03` — `Notification` entity exists in the Prisma schema (`userId`, `type`, `title`, `body`, `readAt?`, `data` JSON).
- Script `04` — NestJS auth module with `sendVerificationEmail()` / `sendPasswordResetEmail()` **stubs** to replace.
- Script `02` — shared brand tokens at `Code/shared/theme/brand.ts` (single source of colors/fonts/radius/logo).
- Scripts `10`–`13` — order lifecycle, refund, shipment, and review hooks that should trigger emails/notifications.
- `RESEND_API_KEY`, `EMAIL_FROM`, `USER_APP_URL`, `ADMIN_APP_URL` present in the backend `.env` / `.env.example` (added in script `01`). Add the Joi entries in `src/config/validation.ts` and surface them via `configuration.ts`.

> **Architecture reminder (00-BUILD-ORDER):** the **backend owns all integrations**. Email sending and scheduled jobs live in the NestJS backend — **not** in Next.js API routes, and there is **no** tRPC. Clients only render UI and call REST endpoints. Money is stored/passed as **integer cents**; format it for display only.
>
> ⚠️ **Next.js 16:** the client tasks below (bell, notifications page) touch client code. Before writing any of it, `npm install` in that client, then read the relevant guide in `node_modules/next/dist/docs/` (routing, data fetching, server vs client components). Do not assume Next 13/14/15 conventions.

---

## Tasks

### 1. [backend] Email module + Resend client
- Create a NestJS `email` module (`src/modules/email/`): `EmailModule`, `EmailService`.
- `EmailService` wraps the Resend SDK (`resend`), reading `RESEND_API_KEY` and `EMAIL_FROM` from `ConfigService`.
- Public method `sendEmail({ to, subject, react, replyTo? })` — renders a React Email component to HTML (`@react-email/render`) and dispatches via Resend. Central `EMAIL_FROM` default (`ShopForge <noreply@shopforge.dev>`).
- Never throw into callers: all sends go through `enqueueEmail()` (Task 7), which isolates failures.

### 2. [backend] Branded base layout from the shared theme
- React Email templates live in the backend at `src/modules/email/templates/`.
- Make the shared brand tokens importable by the backend the same way the clients consume them (path alias to `Code/shared/theme/brand.ts`, or a small build step that reads the tokens) — so a single edit to `brand.ts` re-themes emails **and** both sites (satisfies `00 §5`).
- Build a `BaseLayout` template that applies brand colors, font family, radius, and the store logo (logo public id from `StoreSetting`, rendered as an absolute Cloudinary URL). Include header (logo), body slot, and footer (store name, contact, unsubscribe/manage-preferences link, physical address placeholder for CAN-SPAM). Responsive, table-based, dark-mode-friendly inline styles (FR-903).
- All transactional templates compose `BaseLayout` so they match the storefront visually.

### 3. [backend] Replace the auth email stubs (from script 04) with real sends
- In the auth module, swap the `sendVerificationEmail()` / `sendPasswordResetEmail()` stubs for `EmailService`/`enqueueEmail()` calls using the real templates.
- Verification and reset links point at the **user_client** (`USER_APP_URL`) routes (e.g. `${USER_APP_URL}/verify-email?token=…`, `${USER_APP_URL}/reset-password?token=…`), never at the backend origin.

### 4. [backend] Transactional emails (FR-901)
Template + trigger for each event. Triggers are called from the owning module's service (order/payment/shipment/review), routed through `enqueueEmail()`:
- **Welcome** — on successful email verification (verified registration).
- **Email verification** + **Password reset** (Task 3).
- **Order confirmation** — itemized receipt with line items, quantities, and totals; format cents → currency from `StoreSetting` (FR-503). Triggered from the `payment_intent.succeeded` / order-confirmed hook (script `10`).
- **Shipping update** — carrier + tracking number + tracking link, on `ShipmentEvent` create (script `11`, FR-504).
- **Order delivered / completed** — on the delivered/completed status transition.
- **Refund processed** — amount + order reference, on refund (script `10`/`15`).
- Every template takes a typed props object (no ad-hoc HTML) and renders through `BaseLayout`.

### 5. [backend] Notification module + in-app center endpoints (REST)
- Create/extend the NestJS `notification` module (`src/modules/notification/`): `NotificationModule`, `NotificationService`, `NotificationController`.
- `NotificationService.create({ userId, type, title, body, data })` inserts a `Notification` row; expose a helper to create the same notification for **all admin users** (for admin alerts).
- REST endpoints (all JWT-guarded; a user only sees their own rows — enforced server-side, NFR-208):
  - `GET /notifications` — paginated list for the current user (newest first; supports `?cursor`/`?page`).
  - `GET /notifications/unread-count` — `{ count }`.
  - `PATCH /notifications/:id/read` — mark one read (sets `readAt`).
  - `PATCH /notifications/read-all` — mark all of the current user's notifications read.
- Both clients hit the same endpoints; the JWT identity (customer vs admin) scopes the rows returned. No separate admin path is required because admin notifications are just `Notification` rows owned by admin users.
- DTOs validated with class-validator; controller returns typed response shapes (keep in sync with `Code/shared/types` if used).

### 6. [backend] Admin notifications (FR-902)
- On **new order** (order confirmed), **low-stock alert** (stock crosses the configured threshold — script `15`), and **new review submitted** (script `13`): create `Notification` rows for admin users via the admin helper, and **optionally** send an email to `ADMIN_EMAIL` (gate behind a store setting / env flag).
- These surface in the **admin_client** topbar bell (Task 10).

### 7. [backend] Queue-friendly sending — `enqueueEmail()` (NFR-405)
- Provide a small `enqueueEmail(job)` abstraction in the `email` module so callers never touch Resend directly and the transport can move to a real queue/worker (BullMQ/Redis) later **without changing callers**.
- For now it sends inline but: wraps the send in try/catch, logs failures, and **never blocks or fails** the originating flow (checkout, order update, registration). Add a retry/backoff TODO and structured error logging.

### 8. [backend] Abandoned-cart recovery job (FR-306)
- Implement the scheduled job promised in script `09`: for carts idle **1 hour** and **24 hours** with an identifiable email (logged-in user or captured guest email), send a recovery email (branded template, deep link back to the cart). Mark a cart so each stage fires at most once.
- Run it **in the backend** using `@nestjs/schedule` (`@Cron`), plus an **invokable, guarded route** (`POST /cron/abandoned-carts`, protected by a `CRON_SECRET` header/bearer) so it can also be triggered by an external scheduler. Do **not** put this in a Next.js API route.
- Add `CRON_SECRET` to `.env.example` + Joi.

### 9. [user_client] Notification bell + notifications page
> Read `node_modules/next/dist/docs/` first (§ reminder above).
- Header **notification bell** component: shows unread count (`GET /notifications/unread-count`), polls or refetches via TanStack Query, opens a dropdown of recent items with a link to the full page. Marks items read via `PATCH /notifications/:id/read`.
- `/account/notifications` page: paginated list (order updates, promotions), per-item mark-read, and a **"mark all read"** action (`PATCH /notifications/read-all`). Loading/empty/error states; accessible (keyboard, ARIA live region for the unread badge).
- All calls go through the client's `apiClient` (`credentials: "include"`); no direct DB access.

### 10. [admin_client] Notification bell + notifications page
> Read `node_modules/next/dist/docs/` first.
- Same bell pattern in the admin topbar, consuming the identical REST endpoints with the admin JWT — surfaces new-order / low-stock / new-review alerts (Task 6).
- An admin notifications list view (dropdown + optional full page) with mark-read / mark-all-read. Deep-link each alert to its target (order detail, product inventory, review moderation queue).

### 11. [backend] SMS stub (FR-905, Could — optional)
- Leave a `SmsService.sendSms()` interface stub (Twilio) for order-shipped/delivered. Do not implement unless desired; keep it behind an env flag so it is inert by default.

---

## Acceptance criteria
- [ ] Verification, welcome, order-confirmation, and shipping emails render **branded + responsive** and actually send via Resend to a test inbox.
- [ ] Email templates pull colors/logo/fonts from `Code/shared/theme/brand.ts` and visually match the storefront (editing `brand.ts` restyles emails).
- [ ] Email/link URLs point at `USER_APP_URL`; money in emails is formatted from integer cents in the store currency.
- [ ] The NestJS `notification` module exposes `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`, all JWT-guarded and scoped to the caller.
- [ ] New order, low-stock, and new-review events create `Notification` rows for admins (bell + optional email); admins see them in the admin_client bell.
- [ ] Both clients render a working notification bell (unread count) and notifications page consuming the REST endpoints — no tRPC, no Next API routes for sending.
- [ ] Email sends route through `enqueueEmail()`; a Resend failure never breaks checkout/registration/order flows.
- [ ] Abandoned-cart recovery runs in the backend (`@nestjs/schedule`) and via the guarded `POST /cron/abandoned-carts` route; each cart fires the 1h and 24h emails at most once.
