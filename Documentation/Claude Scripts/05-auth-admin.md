# 05 — Admin Authentication & RBAC (Preseeded, Role-Gated)

**Goal:** Add **role-based access control** to the NestJS backend and an **admin-only** login surface in `admin_client`. Admins authenticate with **email + password only** — no Google, no self-registration — using accounts **preseeded** via `seedAdmin()` from `ADMIN_EMAIL`/`ADMIN_PASSWORD`. RBAC is enforced **at the controller/API layer app-wide** (NFR-208) via a `RolesGuard` + `@Roles()` decorator, not merely in client UI. This script builds on the auth hardening from `04` (cookie JWT, refresh rotation, `role` in the token) and reuses the **same** `/auth/login` (optionally adding a stricter `/auth/admin/login`).

**Prerequisites:**
- Scripts `01`–`04` complete. `04` set the JWT in **httpOnly cookies**, added `role` to the access-token payload, and updated `jwt.strategy.validate()` to return `{ userId, email, role }`. `common/guards/jwt-auth.guard.ts` (`AuthGuard('jwt')`) exists.
- Script `03` added the `Role` enum (`CUSTOMER` · `ADMIN` · `SUPER_ADMIN`) on `User`, defaulting to `CUSTOMER`, and `prisma/seed.ts` exists with an admin-seed placeholder.
- Env vars from `01`: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_APP_URL`. The bcrypt cost constant (**≥12**) introduced in `04`.

> ⚠️ **Next.js 16:** before writing any `admin_client` code, run `npm install` if needed, then read the relevant guides in `Code/frontend/admin_client/node_modules/next/dist/docs/` (routing, layouts, middleware, server actions). Do **not** assume Next 13/14/15 conventions (see `00-BUILD-ORDER.md §7`).

> `admin_client` reuses the shared theme (`02`) and the typed `apiClient` (`01`, `credentials: "include"`).

---

## Tasks

### Backend (`Code/backend`) — RBAC primitives + admin seeding

1. **`@Roles()` decorator** in `common/decorators/roles.decorator.ts`: `export const Roles = (...roles: Role[]) => SetMetadata('roles', roles)` (import `Role` from the generated Prisma client). Add a `ROLES_KEY` constant.

2. **`RolesGuard`** in `common/guards/roles.guard.ts` (`CanActivate`):
   - Reads required roles via `Reflector.getAllAndOverride('roles', [handler, class])`. No `@Roles()` metadata → allow (guard is a no-op unless roles are declared).
   - Reads `request.user` (populated by `JwtAuthGuard`/`jwt.strategy`, which now carries `role` from the token) and throws `ForbiddenException` unless `user.role` is in the allowed set. **`SUPER_ADMIN` satisfies any `ADMIN` requirement** (treat it as a superset).
   - Intended usage: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` on a controller/handler. `RolesGuard` must run **after** `JwtAuthGuard`.

3. **Convenience helpers / examples.** Provide clear usage examples (in the module or a short doc comment):
   - `adminOnly` → `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN, Role.SUPER_ADMIN)`.
   - `superAdminOnly` → `@Roles(Role.SUPER_ADMIN)`.
   Optionally wrap these as composed decorators (`applyDecorators`) `@AdminOnly()` / `@SuperAdminOnly()` in `common/decorators/`. Add a commented example on one existing endpoint (e.g. a protected `user` controller route) so later scripts (07, 12, 15…) follow the pattern. **Do not register `RolesGuard` as a global `APP_GUARD`** unless every route declares roles — keep it opt-in per controller so public/storefront routes stay open.

4. **`seedAdmin()` in `prisma/seed.ts`** (idempotent):
   - Read `ADMIN_EMAIL` + `ADMIN_PASSWORD` from validated env (fail loudly if missing).
   - `prisma.user.upsert({ where: { email: ADMIN_EMAIL }, ... })` creating/keeping a **`SUPER_ADMIN`** with `password = bcrypt(ADMIN_PASSWORD, 12)`, `provider = 'LOCAL'`, `emailVerified = now()`, and a sensible `firstName`/`lastName` (e.g. "Super", "Admin"). Re-running must **not** duplicate.
   - Add an `npm run seed:admin` script (runs only the admin seed via `tsx`) for provisioning admins in any environment. Document: to add more admins, change env + re-run, or add a small `scripts/create-admin.ts` CLI that creates an `ADMIN`/`SUPER_ADMIN`.

5. **Admin login (reuse `/auth/login`, optional dedicated endpoint).**
   - The **same** `POST /auth/login` works for admins — it already sets the cookie JWT with `role`. The `admin_client` simply never calls register/Google.
   - **Optional but recommended:** add `POST /auth/admin/login` in `auth.controller.ts` that runs `validateUser`, then **rejects any user whose role is `CUSTOMER`** (throw `ForbiddenException('Not an admin account')`) before issuing tokens/cookies. This gives a hard server-side boundary so a customer credential can never mint an admin session even if the admin UI is bypassed. Apply the same **rate limiting** (`04` Task 7: 5 attempts → 15-min lockout) to this route.
   - Admin sessions use the same cookie + refresh-rotation machinery from `04`; no separate token system.

6. **Optional TOTP extension point (FR-107, Should — do NOT implement now).** Leave a clearly-marked seam for two-factor: e.g. note where a nullable `totpSecret`/`totpEnabled` field would go on `User` and where a `verify-totp` step would slot into the admin login flow. Comment only.

7. **Wire-up & config.** Ensure `RolesGuard`/decorators are exported from `common/` for reuse. Extend `src/config/validation.ts` (Joi) so `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_APP_URL` are validated/required. Confirm `npm run start:dev` boots and `npm run build` passes; run `npm run seed:admin` and verify the `SUPER_ADMIN` row.

### admin_client (`Code/frontend/admin_client`) — login-only UI + guard

> Read `node_modules/next/dist/docs/` first. Use the `apiClient` (`credentials: "include"`), TanStack Query, react-hook-form + Zod, and the shared theme. Accessible + keyboard-navigable.

8. **Auth API + context.** In `src/lib/api/`, add `login` (→ `POST /auth/admin/login` if built, else `/auth/login`), `logout`, and `getMe` (`GET /auth/me`). In `src/lib/auth/`, add an `AuthProvider` + `useAuth()` that resolves the current admin via `/auth/me`, exposing `{ user, isLoading, isAuthenticated, isAdmin, login, logout }` where `isAdmin = role ∈ {ADMIN, SUPER_ADMIN}`. Mount in the root layout. Reuse the `04` silent-refresh-on-401 behavior.

9. **Login-only page** at `src/app/login/page.tsx` (or an `(auth)` group): a minimal branded **email + password** form — **no Google button, no register link, no forgot-password self-service** (admin resets are handled out-of-band via re-seed/CLI). react-hook-form + Zod (email + non-empty password). On success, route to `/` (dashboard). Show a clear error on bad credentials or the `403` non-admin rejection.

10. **Middleware / route guard.** Add `middleware.ts` protecting **all** admin routes except `/login`: redirect requests without the access-token cookie to `/login`. Because the cookie is httpOnly and its contents aren't trusted client-side (NFR-208), also do an authoritative **server-side `getMe`** check in the admin shell layout and **redirect non-admin roles** (a `CUSTOMER` who somehow authenticated) to `/login` after clearing their session. Follow Next 16 middleware/layout conventions.

11. **Admin shell layout placeholder** in an authenticated layout (e.g. `src/app/(admin)/layout.tsx`): a sidebar + topbar shell with the theme toggle (`02`), the signed-in admin's name, and a working **sign-out** (calls `logout`, clears state, redirects to `/login`). Placeholder nav links (built out in script `15`): Dashboard, Products, Orders, Customers, Inventory, Coupons, Reviews, Media, Settings, Audit Log.

---

## Acceptance criteria

- [ ] `common/` exports a `@Roles()` decorator and a `RolesGuard`; `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN)` blocks a `CUSTOMER` with **403** and allows `ADMIN`/`SUPER_ADMIN`; `SUPER_ADMIN` satisfies `ADMIN`-only routes.
- [ ] Routes without `@Roles()` remain open (guard is opt-in; storefront/public endpoints unaffected).
- [ ] `npm run seed:admin` creates a `SUPER_ADMIN` from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (bcrypt ≥12, `emailVerified` set); re-running is **idempotent** (no duplicate).
- [ ] Admin can log in with email + password (via `/auth/admin/login` if built, else `/auth/login`); the cookie JWT carries `role`. If `/auth/admin/login` exists, a `CUSTOMER` credential is rejected with **403** there.
- [ ] Admin login is rate-limited (5 attempts → 15-min lockout).
- [ ] `admin_client` `/login` shows **email + password only** — no Google, no register, no self-service reset.
- [ ] A logged-out user hitting any admin route is redirected to `/login`; a `CUSTOMER` cannot reach the admin shell (blocked/redirected by middleware + server-side `getMe`).
- [ ] Admin shell renders with placeholder nav, the shared theme toggle, and a working sign-out.
- [ ] TOTP is left as a documented extension point only (not implemented).
- [ ] `npm run build` passes in `backend` and `admin_client`; env additions validated by Joi on boot.
