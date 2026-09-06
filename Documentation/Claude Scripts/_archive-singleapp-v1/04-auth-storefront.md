# 04 — Storefront Authentication (Email + Google)

**Goal:** Customer-facing auth via **email + password (with email verification)** and **Sign in with Google**. New sign-ups get role `CUSTOMER`. Also sets up the shared Auth.js instance, tRPC context, and session plumbing used everywhere.

**Prerequisites:** Scripts `01`–`03` complete (User/Account/Session models exist). Google OAuth credentials in `.env` (`AUTH_GOOGLE_ID/SECRET`). `AUTH_SECRET` set.

**Note on admin:** Admin login is a **separate** flow (script `05`) — do not add Google or self-registration for admins.

---

## Tasks

### 1. Auth.js (NextAuth v5) core
- `src/lib/auth.ts` exporting `auth`, `handlers`, `signIn`, `signOut` via `NextAuth({...})`.
- **PrismaAdapter** (`@auth/prisma-adapter`) against `src/server/db.ts`.
- Session strategy: **JWT** in HTTP-only secure cookies; include `role` and `id` in the token/session callbacks (NFR-208 needs role at API layer).
- Route handler `src/app/api/auth/[...nextauth]/route.ts`.

### 2. Providers
- **Google** provider (scopes: profile, email). On first Google sign-in, create `User` with role `CUSTOMER`, `emailVerified` set.
- **Credentials** provider for **email/password**:
  - `authorize()` looks up user by email, rejects if no `passwordHash` (OAuth-only) or `emailVerified` is null, verifies with `bcryptjs.compare`.
  - Passwords hashed with **bcrypt cost ≥ 12** (NFR-204).

### 3. Registration + email verification (FR-101)
- tRPC `auth` router (public procedures): `register`, `verifyEmail`, `requestPasswordReset`, `resetPassword`, `resendVerification`.
- `register`: Zod-validate (password policy: min 8, 1 upper, 1 number, 1 symbol — FR-105), hash password, create `CUSTOMER` with `emailVerified=null`, create a `VerificationToken`, send verification email (email delivery lands in script `16`; for now call a `sendVerificationEmail()` stub in `src/lib/email.ts` that logs the link).
- `verifyEmail`: consume token, set `emailVerified`.
- Password reset via secure link expiring in **1 hour** (FR-103).

### 4. Rate limiting (NFR-205, FR-106)
- Add `src/lib/rate-limit.ts` (in-memory now; Redis/Upstash later). Apply to `register`, credentials `login`, `requestPasswordReset`: **5 attempts → 15 min lockout**, progressive.

### 5. tRPC wiring (shared for the whole app)
- `src/server/trpc.ts`: init tRPC with `superjson`, context `{ session, prisma, req }`.
- Procedures: `publicProcedure`, `protectedProcedure` (requires session), `customerProcedure`. (Admin procedures in script `05`.)
- `src/server/routers/_app.ts` root router; `src/app/api/trpc/[trpc]/route.ts` handler; client provider `src/lib/trpc.tsx` (React Query).

### 6. UI (storefront)
Under `app/(storefront)/(auth)/`:
- `/login` — email/password form + **"Continue with Google"** button + links to register/reset. Password field with show/hide.
- `/register` — form with **password strength meter** (SRD §8.1), inline Zod validation, Google button.
- `/verify-email`, `/forgot-password`, `/reset-password` pages.
- Use Shadcn form components + semantic theme tokens; fully accessible + keyboard-navigable.

### 7. Session helpers
- `getCurrentUser()` server helper; `useSession` client usage.
- Middleware allows public storefront; gates `/account/**` to authenticated `CUSTOMER`+.

---

## Acceptance criteria
- [ ] Register → receive verification link (logged) → verify → login with email/password works.
- [ ] Unverified users cannot log in via credentials.
- [ ] "Continue with Google" creates/authenticates a `CUSTOMER`.
- [ ] Password policy enforced; passwords bcrypt-hashed (cost ≥ 12).
- [ ] Reset-password link expires after 1 hour; login rate limiting triggers lockout after 5 fails.
- [ ] Session exposes `role` + `id` server-side (verify in a tRPC procedure).
- [ ] `/account` redirects to `/login` when logged out.
