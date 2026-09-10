# Techistan — Admin Client (Admin Panel)

Back-office admin panel for Techistan. Next.js 16 (App Router, React 19, Tailwind v4, React Compiler).

- **Port:** `3002`
- **Backend API:** NestJS at `http://localhost:3000` (set via `NEXT_PUBLIC_API_URL`)
- Admin login is **email + password only**, accounts are **preseeded** (no self-registration, no Google). See `Documentation/Claude Scripts/05-auth-admin.md`.
- Part of a 3-app system: `user_client` + this admin panel + the `backend`. See `Documentation/Claude Scripts/00-BUILD-ORDER.md`.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3002
```

This client owns its theme outright: `src/theme/brand.ts`, `tokens.ts` and `emit-css.ts` are tracked source, not copies of anything. `predev`/`prebuild` run `gen:theme`, which emits `src/theme/generated/theme.css` (git-ignored) from them. **Re-brand by editing `src/theme/brand.ts`.**

That change stays inside this app. The other client and the backend's transactional emails each keep their own brand file, so a platform-wide re-brand now means editing all three:

- `Code/frontend/user_client/src/theme/brand.ts`
- `Code/frontend/admin_client/src/theme/brand.ts`
- `Code/backend/src/shared/brand.ts`

## Scripts
- `dev` — start on :3002 (syncs theme first)
- `build` / `start` — production build / serve on :3002
- `lint`, `format` — ESLint / Prettier

## Conventions
- Data comes from the backend **REST API** via the typed `src/lib/api/client.ts` (`credentials: "include"` for the JWT cookie) + TanStack Query (`src/app/providers.tsx`). Admin actions hit role-guarded `/admin/*` endpoints.
- ⚠️ **Next.js 16** has breaking changes vs earlier versions — consult `node_modules/next/dist/docs/` before writing client code (see `AGENTS.md`).

## Build scripts
This app is built by executing the numbered scripts in `Documentation/Claude Scripts/` in order.
