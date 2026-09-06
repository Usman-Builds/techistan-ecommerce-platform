# 01 — Project Setup & Foundation

**Goal:** Get all three existing apps installed, running, on non-colliding ports, with shared tooling, a shared workspace for the theme, and validated env config. After this script: backend runs on `:3000`, both clients run (`:3001`, `:3002`) showing a blank page, and health checks pass.

**Prerequisites:** Node 20+ and **npm**. Local PostgreSQL running with a database named `ecom` (the backend `.env` already points at `postgresql://postgres:260603@localhost/ecom`). Run commands from `D:\Work\Hobby Projects\ecommerce\Code`.

> ⚠️ **Do not scaffold new apps.** `Code/backend`, `Code/frontend/user_client`, and `Code/frontend/admin_client` already exist. This script wires up and extends them. Do **not** run `create-next-app` or `nest new`.
>
> ⚠️ **Next.js 16:** before writing any client code, read `node_modules/next/dist/docs/` in that client for the relevant API (see `00-BUILD-ORDER.md §7`).

---

## Tasks

### 1. Backend — verify it runs
- From `Code/backend`: deps are already installed. Confirm with `npm run start:dev` — it should boot NestJS on **:3000**.
- Confirm Prisma can reach the DB: `npx prisma generate` then `npx prisma db pull` (or `migrate status`). If the `ecom` DB doesn't exist yet, create it and run `npx prisma migrate dev` (full schema lands in script `03`).
- Add a health endpoint: `GET /health` → `{ status: "ok" }` (NFR-305). Simple controller in `app.controller.ts` or a tiny `health` module. Leave it unguarded.
- Enable **CORS with credentials** in `main.ts` for the two client origins (`http://localhost:3001`, `http://localhost:3002`) — needed for cookie-based JWT (see `00 §4`). Read origins from config; default to those two in dev.
- Add `cookie-parser` (`npm i cookie-parser` + `@types/cookie-parser`) and wire `app.use(cookieParser())` — the auth scripts (`04`/`05`) set the JWT cookie.

### 2. Clients — install & set ports
For **both** `user_client` and `admin_client`:
- `npm install` (neither has `node_modules` yet).
- Set dev/start ports so they don't collide with the backend or each other. Edit `package.json` scripts:
  - `user_client`: `"dev": "next dev -p 3001"`, `"start": "next start -p 3001"`
  - `admin_client`: `"dev": "next dev -p 3002"`, `"start": "next start -p 3002"`
- Confirm each boots (`npm run dev`) and serves the default page.
- Install the shared client deps used across later scripts (install now, configure later):
  ```
  @tanstack/react-query zustand next-themes react-hook-form zod clsx tailwind-merge class-variance-authority lucide-react framer-motion
  ```
  Add the `cn()` util at `src/lib/utils.ts` in each client.

### 3. Shared workspace (theme + types)
- Create `Code/shared/` with `theme/` and `types/` subfolders (`.gitkeep` for now; brand tokens land in script `02`).
- Make it consumable by **both** clients without publishing to npm. Choose the simplest reliable option for Next 16 and record it in each client's README:
  - **Preferred:** add `Code/shared` as a path alias in each client's `tsconfig.json` (`"@shared/*": ["../../shared/*"]`) **and** add `transpilePackages`/`turbopack` config as required by Next 16 to compile files outside the app root. **Verify the exact mechanism against `node_modules/next/dist/docs/` — Next 16 may differ from older versions.**
  - Fallback if cross-root imports fight the bundler: a small `sync-theme` npm script that copies `shared/theme` into each client's `src/theme/generated`.
- Goal: editing `shared/theme/brand.ts` re-themes both clients (satisfies `00 §5`).

### 4. Folder scaffold
- **Backend** (`Code/backend/src`): ensure `common/{guards,decorators,interceptors,filters}` and `modules/` exist. Module folders are created by their owning scripts.
- **Clients** (`src/` in each): create `components/{ui,shared}` (+ `storefront` for user_client, `admin` for admin_client), `lib/{api,auth}`, `theme/` with `.gitkeep`.

### 5. Linting, formatting
- Backend already has ESLint + Prettier — leave as is.
- Clients: keep the create-next-app ESLint; add **Prettier** + `prettier-plugin-tailwindcss` to each and a `format` script. Add a root `.editorconfig` under `Code/` for consistency.
- Do **not** add Husky at the repo root (three separate git repos). If desired, add per-repo pre-commit later in script `18`.

### 6. Environment config
- **Backend** (`Code/backend`): keep `.env.development`. Create a committed **`.env.example`** documenting every var used across the whole build (placeholders only — no real secrets):
  ```
  NODE_ENV=development
  APP_NAME=ShopForge
  PORT=3000
  CLIENT_ORIGINS=http://localhost:3001,http://localhost:3002

  DATABASE_URL=postgresql://user:pass@localhost:5432/ecom?schema=public

  # Auth
  JWT_SECRET=
  JWT_EXPIRES_IN=86400
  JWT_REFRESH_SECRET=
  JWT_REFRESH_EXPIRES_IN=2592000

  # Admin preseed (script 05)
  ADMIN_EMAIL=admin@shopforge.dev
  ADMIN_PASSWORD=

  # Google OAuth
  GOOGLE_CLIENT_ID=
  GOOGLE_CLIENT_SECRET=
  GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

  # Cloudinary (script 06)
  CLOUDINARY_CLOUD_NAME=
  CLOUDINARY_API_KEY=
  CLOUDINARY_API_SECRET=

  # Stripe (script 10)
  STRIPE_SECRET_KEY=
  STRIPE_WEBHOOK_SECRET=

  # Email (script 16)
  RESEND_API_KEY=
  EMAIL_FROM=ShopForge <noreply@shopforge.dev>

  # Frontend base URLs (for emails/redirects)
  USER_APP_URL=http://localhost:3001
  ADMIN_APP_URL=http://localhost:3002
  ```
- Extend `src/config/validation.ts` (Joi) and `src/config/configuration.ts` to include the new vars **as they are introduced** by later scripts (add the ones needed now: `CLIENT_ORIGINS`, refresh-token vars — keep the rest optional until their script). Ensure `.env*` (except `.env.example`) is gitignored.
- **Clients:** create `.env.local` (gitignored) + `.env.example` in each with:
  ```
  NEXT_PUBLIC_API_URL=http://localhost:3000
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
  ```

### 7. API client stub
- In each client, add `src/lib/api/client.ts`: a typed `fetch` wrapper hitting `NEXT_PUBLIC_API_URL`, sending `credentials: "include"` (for the JWT cookie), with JSON helpers and error normalization. Wire a `QueryClientProvider` (TanStack Query) in the root layout (respect Next 16 layout conventions).

### 8. READMEs
- Update each app's `README.md`: what it is, port, `npm run dev`, env setup, and a pointer to `Documentation/Claude Scripts`. In the backend README, note the shared-theme mechanism chosen in Task 3.

---

## Acceptance criteria
- [ ] `npm run start:dev` in `backend` boots on `:3000`; `GET /health` returns `{ status: "ok" }`.
- [ ] Backend CORS allows `:3001`/`:3002` with credentials; `cookie-parser` wired.
- [ ] `npm run dev` in `user_client` serves on **:3001**; in `admin_client` on **:3002** — no port collision.
- [ ] Both clients have deps installed, `cn()` util, an `apiClient` stub, and a QueryClient provider.
- [ ] `Code/shared/theme` is importable from both clients (or the `sync-theme` fallback works).
- [ ] `.env.example` committed in all three apps; real `.env*` gitignored; Joi validates backend env on boot.
- [ ] Folder scaffold matches `00-BUILD-ORDER.md §6`.
