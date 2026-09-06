# 04 — Storefront Authentication (Customer)

**Goal:** Harden and complete the **customer-facing** authentication flow by **extending the existing NestJS `auth` module** (do **not** replace it). Deliver email verification, password reset, a strengthened password policy, higher bcrypt cost, refresh-token rotation, login/register rate limiting, cookie-based JWT transport, and `/auth/me` + `/auth/logout`. Then build the storefront auth UI in `user_client` (login, register, verify-email, forgot/reset password, Google sign-in, protected routes). New sign-ups get role `CUSTOMER`. Admin auth + RBAC is script `05` — do **not** add admin/role-gating UI here.

**Prerequisites:**
- Scripts `01`–`03` complete. `01` wired **CORS with credentials** for `http://localhost:3001` / `http://localhost:3002` and `cookie-parser` in `backend/src/main.ts`; both clients have deps installed, a typed `apiClient` (fetch, `credentials: "include"`), and a `QueryClientProvider`.
- Script `03` added to the Prisma `User` model a **`role` enum** (`Role`: `CUSTOMER` default · `ADMIN` · `SUPER_ADMIN`) and an **`emailVerified` field**, plus the **verification/reset token tables** (e.g. `VerificationToken`, `PasswordResetToken` — `{ id, userId, token (unique), expiresAt, consumedAt? }`). If any are missing, add them to `schema.prisma` and run `npx prisma migrate dev` **before** starting.
- The existing backend `auth` module: `auth.controller.ts` (`POST /auth/register`, `POST /auth/login`, `GET /auth/google`, `GET /auth/google/callback`), `auth.service.ts` (`register` with bcrypt cost 10, `validateUser`, `login → generateTokens` issuing `{ sub, email }`, `validateGoogleUser`), `dto/{login,register}.dto.ts`, `strategies/{jwt,google}.strategy.ts`, and `common/guards/jwt-auth.guard.ts` (`AuthGuard('jwt')`). The `User` model already has a `refreshToken` field (currently unused) and `provider` enum (`LOCAL`/`GOOGLE`).
- Env vars from `01` present: `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`, `GOOGLE_*`, `USER_APP_URL`, `NODE_ENV`. Google OAuth credentials set for the storefront flow.

> ⚠️ **Next.js 16:** before writing any `user_client` code, run `npm install` if needed, then read the relevant guides in `Code/frontend/user_client/node_modules/next/dist/docs/` (routing, layouts, middleware, server actions, metadata). Do **not** assume Next 13/14/15 conventions (see `00-BUILD-ORDER.md §7`).

> **Money/other conventions** don't apply here, but keep to `00 §9`: all inputs validated by class-validator DTOs server-side; secrets from `.env` only.

---

## Tasks

### Backend (`Code/backend`) — extend the existing `auth` module

1. **Strengthen the password policy (DTO).** In `dto/register.dto.ts`, replace `@MinLength(6)` on `password` with a policy of **min 8 chars, ≥1 uppercase, ≥1 number, ≥1 symbol** (FR-105) using `@MinLength(8)` + `@Matches(/regex/)` (or a custom validator) with a clear message. Keep `firstName`, `lastName`, `email` (`@IsEmail`). Apply the same strength rule to the new reset-password DTO (Task 5). Do not weaken `login.dto.ts`.

2. **Raise bcrypt cost to ≥12** (NFR-204). In `auth.service.ts`, change `bcrypt.hash(data.password, 10)` → cost **12** everywhere passwords are hashed (register + reset). Centralize the cost as a constant so script `05`'s `seedAdmin()` reuses it.

3. **Set role `CUSTOMER` on registration.** In `register()`, explicitly set `role: 'CUSTOMER'` on the created `User` (belt-and-suspenders even though `03` defaults it). Google sign-ups (`validateGoogleUser`) also create `CUSTOMER`.

4. **Email verification (verification-link flow, FR-101).**
   - On `register()`: create the user with `emailVerified = null`, generate a cryptographically-random token, persist a `VerificationToken` row (expires in **24h**), and call a **stubbed** `sendVerificationEmail(user, link)` where `link = ${USER_APP_URL}/verify-email?token=...`. The email transport is implemented in script `16`; for now put the stub in a small `mail`/`notification` service (or `auth.service`) that **logs the link** to the console. Do not block registration on delivery.
   - Add `POST /auth/verify-email` (`{ token }`): look up an unconsumed, unexpired token → set `user.emailVerified = now()`, mark the token consumed. Idempotent-safe.
   - Add `POST /auth/resend-verification` (`{ email }`): issues a fresh token if the user exists and is unverified. Always return a generic success (no account enumeration). Rate-limited (Task 7).
   - **Gate login on verification for LOCAL users:** in `validateUser` (or `login`), reject `provider === 'LOCAL'` users whose `emailVerified` is null with a clear `403`/`ForbiddenException` ("Please verify your email"). Google users are considered verified.

5. **Password reset (request + reset, FR-103).**
   - `POST /auth/forgot-password` (`{ email }`): if the user exists, create a `PasswordResetToken` (expires in **1 hour**) and stub-send `${USER_APP_URL}/reset-password?token=...` (logged for now). Always return generic success (no enumeration). Rate-limited.
   - `POST /auth/reset-password` (`{ token, password }`): validate token (unconsumed, unexpired), enforce the strong-password DTO, `bcrypt.hash(password, 12)`, update the user, consume the token, and **invalidate existing sessions** by clearing `refreshToken` (Task 6). Add a `reset-password.dto.ts`.

6. **Refresh-token rotation** (using the existing `User.refreshToken` field + `JWT_REFRESH_SECRET`).
   - Extend `generateTokens(user)` to also mint a **refresh token** (separate secret `JWT_REFRESH_SECRET`, longer `JWT_REFRESH_EXPIRES_IN`, payload `{ sub, email }`). Store a **bcrypt hash** of the refresh token in `user.refreshToken` (never the raw token).
   - Keep the access-token payload as `{ sub, email, role }` — **add `role`** so `RolesGuard` (script `05`) and `/auth/me` can read it without an extra query. Ensure the existing `login` and Google flows include `role`.
   - `POST /auth/refresh`: read the refresh token from its cookie (Task 8), verify signature + expiry, compare against the stored hash, and on success **rotate** (issue new access + refresh, overwrite the stored hash, reset cookies). On mismatch, clear `refreshToken` and 401 (reuse detection).

7. **Rate limiting / lockout (NFR-205, FR-106).**
   - Add `@nestjs/throttler` (`npm i @nestjs/throttler`), register `ThrottlerModule` globally (or scoped), and apply a **5 attempts → 15-minute lockout** policy on `POST /auth/login`, `POST /auth/register`, `POST /auth/forgot-password`, `POST /auth/resend-verification` via `@Throttle(...)` / a `ThrottlerGuard`. Key by IP (+ email where sensible). Return `429` on lockout. (A Redis store can replace the default in-memory store later; in-memory is fine now.)

8. **Cookie-based JWT transport** (upgrade the current JSON-token response; keep a bearer fallback).
   - In `auth.controller.ts`, inject `@Res({ passthrough: true }) res` on `register`, `login`, the Google callback, `refresh`, and `logout`, and set the tokens as cookies:
     - **access** cookie (e.g. `access_token`) and **refresh** cookie (e.g. `refresh_token`), both `httpOnly: true`, `sameSite: 'lax'`, `secure: NODE_ENV === 'production'`, `path: '/'`, with `maxAge` matching each token's TTL. (Cross-site prod may require `sameSite: 'none'` + `secure: true` — read origins from config.)
   - Continue returning the **`{ user }`** JSON (and optionally `accessToken` for tooling/bearer fallback) so clients can hydrate immediately.
   - **`jwt.strategy.ts`:** change `jwtFromRequest` to an `ExtractJwt.fromExtractors([...])` that reads the access token from the **cookie first**, then falls back to `ExtractJwt.fromAuthHeaderAsBearerToken()`. Update `validate(payload)` to return `{ userId: payload.sub, email: payload.email, role: payload.role }`.
   - **Google callback:** after `validateGoogleUser`, set the cookies and **redirect** the browser to `${USER_APP_URL}` (or a `/auth/callback` route) instead of returning raw JSON, so the OAuth round-trip lands the user back in the storefront authenticated.

9. **`/auth/me` and `/auth/logout`.**
   - `GET /auth/me` — guarded by `JwtAuthGuard`; returns the current user's public profile (`id, firstName, lastName, email, role, provider, emailVerified, profilePhoto`). This is the endpoint the client auth context calls.
   - `POST /auth/logout` — clears the `refreshToken` in the DB and **clears both auth cookies**; returns `{ success: true }`.

10. **Wire-up & config.** Register any new providers (mail stub, throttler) in `auth.module.ts`. Add the new endpoints to `auth.controller.ts`. Extend `src/config/validation.ts` (Joi) so `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`, and `USER_APP_URL` are validated/required. Confirm `npm run start:dev` boots and `npm run build` passes.

### user_client (`Code/frontend/user_client`) — storefront auth UI

> Read `node_modules/next/dist/docs/` first (Task note above). Use the `apiClient` from script `01` (`credentials: "include"`), **TanStack Query**, **react-hook-form + Zod**, and semantic theme tokens from script `02`. All pages accessible + keyboard-navigable (WCAG 2.1 AA).

11. **Auth API layer.** In `src/lib/api/`, add typed functions for `register`, `login`, `logout`, `getMe`, `verifyEmail`, `resendVerification`, `forgotPassword`, `resetPassword`, `refresh` — all through the shared `apiClient` (cookies flow automatically). Mirror the backend password Zod schema (min 8 / 1 upper / 1 number / 1 symbol) for client-side form validation.

12. **Auth context/hook.** Add `src/lib/auth/` with an `AuthProvider` + `useAuth()` hook that fetches `GET /auth/me` (via TanStack Query) to resolve the current user, exposes `{ user, isLoading, isAuthenticated, login, register, logout }`, and invalidates the `me` query on login/logout. Mount the provider in the root layout (below the QueryClient provider). Follow Next 16 client-component/layout conventions.

13. **Auth pages** under the storefront auth route group (e.g. `src/app/(auth)/`):
    - `/login` — email + password form (show/hide toggle), a **"Continue with Google"** button that navigates the browser to `${NEXT_PUBLIC_API_URL}/auth/google`, links to register + forgot-password. Surface the "verify your email" `403` clearly with a **resend** action.
    - `/register` — firstName, lastName, email, password with an inline **password-strength meter** and Zod validation; Google button. On success, route to a "check your email to verify" state.
    - `/verify-email` — reads `?token=`, calls `verifyEmail`, shows success/failure, offers resend on failure, links to `/login`.
    - `/forgot-password` — email input → `forgotPassword`; always shows a generic "if an account exists…" confirmation.
    - `/reset-password` — reads `?token=`, new-password + confirm fields with the strength meter → `resetPassword`; on success route to `/login`.

14. **Protected routes.** Gate customer-only areas (e.g. `/account/**`) so logged-out users are redirected to `/login`. Implement per Next 16 docs — prefer `middleware.ts` (check the access-token cookie presence) plus a server-side `getMe` check in the account layout for authoritative role/identity. Do **not** trust the cookie's contents client-side for authorization — the backend guards are the source of truth (NFR-208).

15. **Session continuity.** On a `401` from the `apiClient`, attempt a single silent `POST /auth/refresh` and retry once; on failure, clear auth state and redirect to `/login`. Keep this in the `apiClient` interceptor or the auth layer.

> **Admin note:** the admin surface (RBAC, `RolesGuard`/`@Roles()`, preseeded admin, `admin_client` login-only UI, optional `/auth/admin/login`) is delivered in script `05`. Do not build it here.

---

## Acceptance criteria

- [ ] Register with a weak password is rejected by the DTO (needs ≥8 / upper / number / symbol); passwords are bcrypt-hashed at cost **≥12**.
- [ ] Registering creates a `CUSTOMER` with `emailVerified = null` and logs a verification link; hitting `POST /auth/verify-email` with that token sets `emailVerified` and lets the user log in.
- [ ] An unverified `LOCAL` user is **blocked** from `POST /auth/login` with a clear message; `resend-verification` issues a fresh link.
- [ ] `forgot-password` logs a reset link that expires in **1 hour**; `reset-password` enforces the strong policy, updates the hash, and invalidates old sessions (clears `refreshToken`).
- [ ] On login/register/Google, the backend sets **httpOnly** `access_token` + `refresh_token` cookies (`sameSite`, `secure` in prod) and returns `{ user }`; the access-token payload includes `role`.
- [ ] `POST /auth/refresh` rotates tokens using the hashed `User.refreshToken` + `JWT_REFRESH_SECRET`; a reused/invalid refresh token is rejected (401) and clears the stored hash.
- [ ] `jwt.strategy` reads the token from the cookie **and** still accepts a bearer header; `GET /auth/me` returns the current user; `POST /auth/logout` clears cookies + DB refresh token.
- [ ] `login`/`register`/`forgot-password`/`resend-verification` lock out after **5 attempts for 15 minutes** (429).
- [ ] "Continue with Google" completes the OAuth round-trip and lands the user back in `user_client` authenticated (cookies set, `/auth/me` resolves).
- [ ] `user_client` has `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` pages (react-hook-form + Zod, strength meter, accessible), an `AuthProvider`/`useAuth()` reading `/auth/me`, and `/account/**` redirects to `/login` when logged out.
- [ ] `npm run build` passes in `backend` and `user_client`; env additions validated by Joi on boot.
