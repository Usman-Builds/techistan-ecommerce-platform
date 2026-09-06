# Techistan — Backend (NestJS REST API)

The single backend for Techistan, serving both the `user_client` (storefront, :3001) and `admin_client` (admin panel, :3002). NestJS 11 + Prisma 6 + PostgreSQL.

- **Port:** `3000` · **Health:** `GET /health` → `{ "status": "ok" }`
- **DB:** local Postgres database `ecom` (`DATABASE_URL` in `.env.development`)
- **Auth:** Passport JWT (email + password), delivered as an httpOnly cookie; RBAC by `role` (added in script 05). CORS allows the two client origins with credentials.
- **Setup:** `cp .env.example .env.development` (fill in) → `npx prisma generate` → `npm run start:dev`
- Built by executing the numbered scripts in `Documentation/Claude Scripts/` in order (`00-BUILD-ORDER.md` first).

> Frontend theming note: brand tokens live in `Code/shared/theme/brand.ts` and are synced into each client — a backend concern only for branded emails (script 16), which import from the same shared source.

---

## Running in Docker

Everything is driven from the **monorepo root** (`Code/`), not from `backend/`. That is not a stylistic choice: `npm run build` fires a prebuild hook that copies `shared/theme/brand.ts` into `src/shared/brand.generated.ts`, so a build context rooted at `backend/` cannot produce a working image.

```bash
cd Code
cp backend/.env.docker.example backend/.env.docker   # then fill in the secrets
docker compose up --build
```

That brings up three services in order — `db` (Postgres 17), `migrate` (applies pending Prisma migrations, then exits), and `api` (the NestJS server on `http://localhost:3000`). Check it with `curl http://localhost:3000/health`.

| File | Purpose |
| --- | --- |
| `backend/Dockerfile` | Multi-stage build. `--target runtime` is the API image; `--target migrate` keeps the dev dependencies so it still has the Prisma CLI and `tsx`. |
| `docker-compose.yml` | Root-level, because the build context is the root. |
| `backend/.env.docker.example` | Template for `backend/.env.docker`, which Compose loads into every container. Your `.env.development` is untouched — host runs and container runs stay independent. |
| `.dockerignore` | Root-level, matching the context. |

**`NODE_ENV` is the setting to get right first.** The example file ships `development`, which is what boots today: on `production`, `config/validation.ts` refuses to start without Cloudinary, Stripe, Resend and cron secrets all present. Flip it once those are filled in.

### Schema and seed data

Migrations run in their own container before the API starts, rather than on the app's boot path — that way a bad migration fails one short-lived container instead of crash-looping every replica.

```bash
docker compose run --rm migrate                              # re-apply migrations
docker compose run --rm seed                                 # catalog + settings + admin
docker compose run --rm seed npm run seed:demo               # larger demo catalog
docker compose run --rm seed npm run backfill:homepage       # homepage section backfill
```

### Notes

- **Ports.** Postgres is published on **5433**, not 5432, so the container sits alongside the local Postgres you already develop against instead of fighting it for the port. Point Prisma Studio or `psql` at `localhost:5433`.
- **The frontends still run on the host.** `CLIENT_ORIGINS`, `USER_APP_URL` and `ADMIN_APP_URL` therefore stay on `localhost:3001` / `:3002` — CORS is credentialed, so those must match the browser's origin exactly.
- **Using your existing database instead of the container's:** set `DATABASE_URL` to `host.docker.internal:5432` and leave the `db` service stopped.
- **The Prisma client is generated inside the image.** The one in your working tree is `query_engine-windows.dll.node`, which is inert on Linux.

---

## Source layout

📦 src
│
├── 📁 config/                              # 🧩 Centralized configuration & environment validation
│   ├── configuration.ts                    # Loads all env vars into structured config objects (app, db, jwt, etc.)
│   └── validation.ts                       # Uses Joi to validate env variables at startup (prevents missing/invalid values)
│
├── 📁 prisma/                              # 🗄️ Prisma ORM setup for database access
│   ├── prisma.module.ts                    # Global NestJS module providing PrismaService (dependency injection)
│   └── prisma.service.ts                   # Wraps PrismaClient and handles DB connection lifecycle (connect/disconnect)
│
├── 📁 modules/                             # 📦 All feature modules live here (e.g., auth, user, etc.)
│   │
│   ├── 📁 user/                            # 👤 User management (CRUD)
│   │   ├── dto/                            # Data Transfer Objects — validation for user input
│   │   │   ├── create-user.dto.ts          # Validation schema for creating users
│   │   │   └── update-user.dto.ts          # Validation schema for updating users
│   │   ├── user.controller.ts              # Handles incoming HTTP requests (routes like GET /users, POST /users)
│   │   ├── user.service.ts                 # Business logic and DB interactions (via PrismaService)
│   │   └── user.module.ts                  # Groups all user-related providers/controllers for modularity
│   │
│   └── 📁 auth/                            # 🔐 Authentication & Authorization system
│       ├── dto/                            # Input validation for authentication routes
│       │   ├── login.dto.ts                # Validates login credentials (email, password)
│       │   └── register.dto.ts             # Validates registration data for new users
│       ├── auth.controller.ts              # Defines auth routes (POST /login, POST /register, etc.)
│       ├── auth.service.ts                 # Core auth logic (JWT generation, password hashing, validation)
│       ├── auth.module.ts                  # Bundles all auth providers, controllers, and strategies
│       └── 📁 strategies/                  # Passport strategies for authentication
│           ├── jwt.strategy.ts             # Handles JWT validation (for protected routes)
│
├── 📁 common/                              # 🧰 Shared utilities, guards, interceptors, and decorators
│   ├── 📁 guards/                          # Authorization guards (JWT Guard, Role Guard, etc.)
│   ├── 📁 utils/                           # Helper utilities (hashing passwords, verifying tokens, etc.)
│   ├── 📁 interceptors/                    # Response interceptors (e.g., transform or log responses)
│   ├── 📁 filters/                         # Global exception filters (custom error formatting)
│   └── 📁 decorators/                      # Custom decorators (e.g., @User(), @Roles())
│
├── app.controller.ts                       # Root controller (optional) — handles base route (GET /)
├── app.service.ts                          # Root service — contains shared logic or base messages
├── app.module.ts                           # Root NestJS module — imports config, prisma, and all feature modules
├── main.ts                                 # 🚀 Application entry point — bootstraps the Nest app and global pipes
│
├── .env                                    # 🌍 Default environment file (used in development if none specified)
├── .env.development                        # 🧪 Dev environment — contains local DB and JWT configs
├── .env.production                         # 🚀 Production environment — contains production DB and secure JWT values
│
└── prisma/schema.prisma                    # Prisma schema defining your database models and relations


--Initial Architecture--
                    ┌─────────────────────────────┐
                    │         Mobile App           │
                    │       (React Native)         │
                    │  - UI/UX                     │
                    │  - Auth, Search, Playback    │
                    │  - Calls only NestJS APIs    │
                    └────────────┬────────────────┘
                                 │
                                 ▼
                   ┌─────────────────────────────┐
                   │         NestJS Server        │
                   │      (Gateway + Backend)     │
                   │----------------------------- │
                   │  - REST APIs for Mobile App  │
                   │  - Auth (JWT/OAuth2)         │
                   │  - CRUD (Users, Podcasts)    │
                   │  - API Validation (DTOs)     │
                   │  - PostgreSQL (Main DB)      │
                   │  - Caching (Redis - optional)│
                   │  - Requests AI tasks via     │
                   │    FastAPI microservice      │
                   └────────────┬────────────────┘
                                 │
                                 ▼
                   ┌─────────────────────────────┐
                   │        FastAPI Server        │
                   │      (AI Microservice)       │
                   │----------------------------- │
                   │  - NLP: Transcription,       │
                   │    Summarization, NER, etc.  │
                   │  - CV: Keyframe Detection    │
                   │  - Highlight Generation      │
                   │  - ML Model Inference (GPU)  │
                   │  - Async job processing      │
                   │  - Returns JSON results to   │
                   │    NestJS over REST or gRPC  │
                   └────────────┬────────────────┘
                                 │
                                 ▼
                 ┌────────────────────────────────┐
                 │     Shared Infrastructure       │
                 │-------------------------------- │
                 │  - PostgreSQL (Main Data)       │
                 │  - MinIO / S3 (Video Storage)   │
                 │  - Redis (Cache/Queue)          │
                 │  - Message Broker (RabbitMQ /   │
                 │    Kafka for async tasks)       │
                 │  - Docker / Kubernetes for      │
                 │    orchestration                │
                 └────────────────────────────────┘
