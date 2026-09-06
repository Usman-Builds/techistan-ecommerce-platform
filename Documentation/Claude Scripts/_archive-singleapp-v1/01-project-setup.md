# 01 — Project Setup & Foundation

**Goal:** Scaffold the Next.js 15 application with TypeScript strict, Tailwind, Shadcn/UI, tooling, folder structure, and environment config. After this script the app runs locally with a blank home page and all tooling passes.

**Prerequisites:** Node 20+, pnpm installed. Run from repo root `D:\Work\Hobby Projects\ecommerce`.

---

## Tasks

### 1. Initialize the app
- Create a Next.js 15 app (App Router, TypeScript, ESLint, `src/` dir, `@/*` import alias) in the repo root. Use **pnpm**.
- Enable **React 19**. Confirm `next`, `react`, `react-dom` are on their latest stable majors.
- Set `tsconfig.json` to **strict mode** (`strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`).

### 2. Tailwind CSS v4 + Shadcn/UI
- Install and configure **Tailwind CSS v4**.
- Initialize **Shadcn/UI** (Radix + Tailwind). Choose the CSS-variables color mode (required for the theme system in script `02`). Do **not** finalize brand colors here — script `02` owns them.
- Install `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react`, `framer-motion`.
- Add the `cn()` util at `src/lib/utils.ts`.

### 3. Core dependencies (install now, configure later)
```
prisma @prisma/client zod @trpc/server @trpc/client @trpc/react-query @trpc/next @tanstack/react-query superjson next-themes zustand next-auth@beta @auth/prisma-adapter bcryptjs cloudinary stripe resend @react-email/components
```
Dev: `vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom @playwright/test eslint prettier prettier-plugin-tailwindcss husky lint-staged tsx @types/bcryptjs`

### 4. Folder scaffold
Create the structure from `00-BUILD-ORDER.md §5` with `.gitkeep` placeholders:
`src/server/{routers,services}`, `src/lib`, `src/components/{ui,storefront,admin,shared}`, `src/theme`, `src/styles`, `prisma`.

### 5. Linting, formatting, hooks
- Configure **ESLint** (next + typescript rules) and **Prettier** with `prettier-plugin-tailwindcss`.
- Add npm scripts: `dev`, `build`, `start`, `lint`, `format`, `typecheck` (`tsc --noEmit`), `test`, `test:e2e`.
- Init **Husky** + **lint-staged**: pre-commit runs `lint-staged` (eslint --fix + prettier) and `typecheck`.

### 6. Environment config
Create `.env.example` (committed) and `.env` (gitignored) with placeholders for every service used across the build:
```
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/shopforge

# Auth
AUTH_SECRET=            # openssl rand -base64 32
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Admin seed (script 05)
ADMIN_EMAIL=admin@shopforge.dev
ADMIN_PASSWORD=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Email
RESEND_API_KEY=
EMAIL_FROM=ShopForge <noreply@shopforge.dev>
```
Add a typed env loader at `src/lib/env.ts` using Zod that validates `process.env` at startup and exports a typed `env` object.

### 7. Base app shell
- Minimal root `layout.tsx` (fonts wired in script `02`), a placeholder home page, and a `/api/health` route returning `{ status: "ok" }` (NFR-305).
- Add a global `not-found.tsx` and `error.tsx` (friendly error pages — NFR-304).

### 8. README
Create/update `README.md`: project intro, tech stack, prerequisites, setup steps, script index pointer to `Documentation/Claude Scripts`.

---

## Acceptance criteria
- [ ] `pnpm dev` serves a blank home page at `localhost:3000`.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass.
- [ ] `GET /api/health` returns `{ status: "ok" }`.
- [ ] Pre-commit hook runs on a test commit.
- [ ] `.env.example` committed; `.env` gitignored; `src/lib/env.ts` validates env.
- [ ] Folder structure matches `00-BUILD-ORDER.md §5`.
