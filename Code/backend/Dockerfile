# syntax=docker/dockerfile:1

# =============================================================================
# Techistan backend (NestJS 11 + Prisma 6 + PostgreSQL) — production image.
#
# THE BUILD CONTEXT IS Code/, NOT Code/backend/:
#
#     cd Code
#     docker build -f backend/Dockerfile -t techistan-api .
#
# This used to be a hard requirement: the build ran a prebuild hook that reached
# out to ../../shared/theme/brand.ts, so a context rooted at backend/ could not
# see the file and the image failed to build. That shared directory is gone --
# the backend now owns its brand tokens outright at src/shared/brand.ts -- so
# nothing outside backend/ is referenced any more and the context COULD be
# narrowed to Code/backend/. It is deliberately left at Code/ so that this file,
# docker-compose.yml and render.yaml keep agreeing on one context; narrowing it
# means dropping the "backend/" prefix from every COPY below AND updating both
# of those files in the same commit. The frontends contribute nothing but a
# little upload time (their node_modules and .next are in .dockerignore).
#
# The layout inside the image still mirrors the repo (/app/backend), so no path
# in the tree needs a Docker-only branch.
#
# Every COPY names its sources explicitly instead of "COPY . .". That costs a
# few lines and buys two things: node_modules and .env* are never even
# candidates for inclusion (so no host-built native binaries or secrets can
# reach the image, .dockerignore applied or not), and each source group gets its
# own cache layer.
# =============================================================================


# --- base --------------------------------------------------------------------
# Debian slim rather than Alpine. Prisma's query engine wants a glibc/OpenSSL
# target, and both of the native dependencies here (bcrypt, prisma) publish
# prebuilt glibc binaries -- so nothing has to be compiled and the image needs
# no C toolchain in any stage.
FROM node:24-bookworm-slim AS base

# openssl has to be present in EVERY stage, not just the one that runs the app.
# Prisma picks its query engine by shelling out to "openssl version"; with the
# binary missing it does not fail, it quietly falls back to the 1.1.x target. The
# build stage then bakes libquery_engine-debian-openssl-1.1.x.so.node into the
# image and the app dies at first connect with "could not locate the Query
# Engine for runtime debian-openssl-3.0.x" -- a runtime failure caused entirely
# by what was missing at generate time. Installing it here makes every stage
# detect the same target. ca-certificates covers the outbound TLS this API lives
# on (Stripe, Cloudinary, Resend).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/*

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false
WORKDIR /app/backend


# --- deps --------------------------------------------------------------------
# Full dependency tree (dev included) for compiling. Only the manifests are
# copied, so this layer is reused on every build that does not change them.
FROM base AS deps
COPY backend/package.json backend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci


# --- build -------------------------------------------------------------------
FROM deps AS build

# The schema alone, before the source: editing a service should not invalidate
# the generated Prisma client. Generating here (not on the host) is what puts
# the LINUX query engine in the image -- the host tree carries
# query_engine-windows.dll.node, which would be inert in a container.
COPY backend/prisma ./prisma
# Detects its engine target via openssl, installed in base -- see the note
# there for what silently goes wrong when it is not.
RUN npx prisma generate

COPY backend/tsconfig.json backend/tsconfig.build.json backend/nest-cli.json ./
COPY backend/src ./src

# Plain "nest build" -- there is no prebuild hook any more. Emits
# dist/src/main.js; the entry is nested under src/ because prisma/*.ts is
# compiled too, which lifts the computed rootDir to the package root.
RUN npm run build


# --- prod-deps ---------------------------------------------------------------
# A second, runtime-only tree. Building it fresh rather than pruning the dev one
# keeps the devDependency footprint out of the final image entirely.
FROM base AS prod-deps
COPY backend/package.json backend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# --omit=dev is not enough on its own. @prisma/client declares prisma and
# typescript as OPTIONAL PEER dependencies, and npm installs optional peers
# whether or not dev dependencies were asked for -- so a strictly production
# install still lands a 50 MB CLI and a 23 MB compiler in the image. Nothing in
# compiled JavaScript can reach either (the CLI is a build/migration tool, tsc
# has no runtime role), so they come out. The migrate stage genuinely needs the
# CLI and is built from the dev tree, so it keeps it.
RUN rm -rf node_modules/prisma node_modules/typescript

# The generated client lives outside the package graph, so npm ci cannot produce
# it. Lift it from the build stage instead of re-running prisma generate here --
# the prisma CLI is a devDependency and is not installed in this tree.
COPY --from=build /app/backend/node_modules/.prisma ./node_modules/.prisma


# --- migrate -----------------------------------------------------------------
# One-shot stage for schema work: it keeps the dev dependencies, so it has both
# the prisma CLI (migrate deploy) and tsx (the seed scripts). Compose runs it to
# completion before the API starts, which is what keeps migrations off the
# application's startup path -- N replicas racing "migrate deploy" on boot is a
# reliable way to deadlock a deploy.
FROM build AS migrate
ENV NODE_ENV=production
USER node
CMD ["npx", "prisma", "migrate", "deploy"]


# --- runtime -----------------------------------------------------------------
FROM base AS runtime

ENV NODE_ENV=production \
    PORT=3000

# The node user (uid 1000) ships with the base image. Nothing here is written at
# runtime, so the whole tree stays root-owned and read-only to the process.
USER node

COPY --from=prod-deps /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY backend/package.json ./package.json

# schema.prisma is read at client init to resolve the datasource. The migrations
# are not used by this stage (the migrate stage owns them) but travel with the
# schema so the image can always report which revision it was built against.
COPY backend/prisma ./prisma

EXPOSE 3000

# Node 24 has global fetch, so the check needs no curl in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form, so node is PID 1 and receives SIGTERM directly (main.ts calls
# enableShutdownHooks, which turns that into a clean Prisma disconnect).
CMD ["node", "dist/src/main.js"]
