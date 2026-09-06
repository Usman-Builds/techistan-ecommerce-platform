# 05 — Admin Authentication (Preseeded Email + Password) & RBAC

**Goal:** A **separate** admin login that accepts **only email + password**, with accounts **preseeded** (no self-registration, no OAuth). Enforce role-based access control across admin routes and the API layer.

**Prerequisites:** Script `04` complete (Auth.js + credentials provider + tRPC context exist). `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`.

---

## Tasks

### 1. Admin seeding (preseeded accounts)
- Extend `prisma/seed.ts` with `seedAdmin()`:
  - Read `ADMIN_EMAIL` + `ADMIN_PASSWORD` from validated env.
  - Upsert a `User` with role **`SUPER_ADMIN`**, `emailVerified = now`, `passwordHash = bcrypt(ADMIN_PASSWORD, 12)`.
  - Idempotent (re-running does not duplicate).
- Add `pnpm seed:admin` script (runs just the admin seed) for provisioning admins on any environment.
- Document: to add more admins, set env + re-run, or add a tiny CLI (`scripts/create-admin.ts`) that prompts for email/password/role and creates an `ADMIN`/`SUPER_ADMIN`.

### 2. Admin login flow (email + password only)
- Reuse the existing **Credentials** provider, but the **admin login page** exposes email/password **only** — no Google button, no register link.
- `app/(admin)/admin/login/page.tsx` — minimal branded login form.
- In the credentials `authorize()` / sign-in callback, when the sign-in originates from the admin surface, **reject users whose role is `CUSTOMER`**. Simplest robust approach: after auth, the admin middleware (below) checks role; additionally, the admin login page shows "invalid credentials" if the authenticated user lacks an admin role and immediately signs them out.
- Apply the same rate limiting (5 → 15 min lockout) to admin login.

### 3. RBAC — procedures & middleware
- Add tRPC `adminProcedure` and `superAdminProcedure` in `src/server/trpc.ts` that throw `FORBIDDEN` unless `session.user.role` is `ADMIN`/`SUPER_ADMIN` (NFR-208 — enforce at API layer, not just UI).
- `middleware.ts`: protect `/admin/**` (except `/admin/login`) — redirect unauthenticated to `/admin/login`; redirect authenticated non-admins to storefront `/` with a 403 notice.

### 4. Admin shell
- `app/(admin)/admin/layout.tsx` — sidebar nav + topbar (theme toggle, admin name, sign out). Placeholder links for: Dashboard, Products, Orders, Customers, Inventory, Coupons, Reviews, Media, Settings, Audit Log (built out in script `15`).
- Uses the same theme system (dark/light) as storefront.

### 5. Optional 2FA hook (FR-107, Should)
- Leave a clearly-marked extension point (`totpSecret` field already optional) for TOTP later; do **not** implement now.

---

## Acceptance criteria
- [ ] `pnpm seed:admin` creates a `SUPER_ADMIN` from env; re-running is idempotent.
- [ ] Admin can log in at `/admin/login` with email + password; **no Google option, no register link**.
- [ ] A `CUSTOMER` account cannot access `/admin/**` (redirected/blocked) even with a valid session.
- [ ] `adminProcedure` rejects non-admins with `FORBIDDEN` (verify with a test call).
- [ ] Admin shell renders with working sign-out and theme toggle.
