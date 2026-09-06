# 16 — Notifications & Email

**Goal:** Branded transactional emails (Resend + React Email), admin notifications, and an in-app notification center. Wires up all the email/notification hooks stubbed in earlier scripts. SRD FR-901–FR-905.

**Prerequisites:** Scripts `04` (verification/reset hooks), `10`–`13` (order/review hooks). `RESEND_API_KEY`, `EMAIL_FROM` in `.env`.

---

## Tasks

### 1. Email infrastructure
- `src/lib/email.ts`: Resend client + `sendEmail({ to, subject, react })`. Central `EMAIL_FROM`.
- **React Email** templates in `src/emails/` sharing a branded base layout that pulls colors/logo/fonts from the **theme/brand** system so emails match the site (FR-903, responsive).
- Replace the stubs from script `04` (verification, password reset) with real sends.

### 2. Transactional emails (FR-901)
Templates + triggers:
- Welcome (on verified registration)
- Email verification + password reset
- Order confirmation (itemized receipt — FR-503)
- Shipping update (tracking link — FR-504)
- Order delivered / completed
- Refund processed

### 3. Admin notifications (FR-902)
- On: new order, low-stock alert, new review submitted → create `Notification` rows for admins and (optionally) email. Surface in admin topbar bell.

### 4. In-app notification center (FR-904, Should)
- Customer bell + `/account/notifications`: order updates, promotions. tRPC `notifications`: `list`, `markRead`, `markAllRead`, unread count. Uses the `Notification` model.

### 5. Queue-friendly sending (NFR-405)
- Route sends through a small `enqueueEmail()` abstraction so it can move to a background queue/worker later without changing callers. For now send inline but isolate failures (never block the order flow on email errors).

### 6. Abandoned cart recovery (FR-306)
- Implement the scheduled job from script `09`: email at 1h and 24h idle. Provide a cron/route (`/api/cron/abandoned-carts`) invocable by Vercel Cron.

### 7. SMS (FR-905, Could — optional)
- Leave a `sendSms()` interface stub (Twilio) for order-shipped/delivered; do not implement unless desired.

---

## Acceptance criteria
- [ ] Registration, order confirmation, and shipping emails render branded + responsive and actually send via Resend (test inbox).
- [ ] Email templates visually match the site theme (colors/logo/fonts from brand system).
- [ ] Admins receive new-order / low-stock / new-review notifications (bell + optional email).
- [ ] Customer in-app notification center lists items with unread counts and mark-read.
- [ ] Email failures do not break checkout/order flows.
