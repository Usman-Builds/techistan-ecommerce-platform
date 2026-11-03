#!/usr/bin/env bash
# =============================================================================
# Techistan test gate: the checks a change must pass before a PR is raised.
# Mirrors .github/workflows/ci.yml so "green locally" means "green in CI".
#
#   bash .claude/skills/_shared/test-gate.sh [backend] [user] [admin] [all] [--e2e]
#
#   backend  eslint (no --fix) · nest build · jest + coverage gate · integration
#            tests against a real Postgres (ecom_test) · npm audit (prod, critical)
#   user     storefront: eslint · vitest · next build   (+ Playwright with --e2e)
#   admin    admin console: eslint · vitest · next build
#   all      all three (the default when no package is given)
#   --keep-going  record failures and continue (baseline/diagnostics only;
#                 the gate still exits non-zero if anything failed)
#
# Integration DB: uses Code/backend/.env.test if present (it must point at
# ecom_test). Otherwise starts a throwaway postgres:16 container on port 5434
# and removes it on exit. If neither works the gate FAILS rather than skipping.
#
# Exits non-zero on the first failing step and always prints a SUMMARY block.
# =============================================================================
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
CODE="$ROOT/Code"
PKGS=()
E2E=0
KEEP=0
FAILED=0
for a in "$@"; do
  case "$a" in
    backend|user|admin) PKGS+=("$a") ;;
    all) PKGS=(backend user admin) ;;
    --e2e) E2E=1 ;;
    --keep-going) KEEP=1 ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done
[ ${#PKGS[@]} -eq 0 ] && PKGS=(backend user admin)

RESULTS=()
CLEANUP=()
LOG_DIR="$(mktemp -d)"

cleanup() { for c in "${CLEANUP[@]}"; do eval "$c" >/dev/null 2>&1 || true; done; }
trap cleanup EXIT

summary() {
  echo
  echo "==================== TEST GATE SUMMARY ===================="
  for r in "${RESULTS[@]}"; do echo "$r"; done
  echo "commit: $(git -C "$ROOT" rev-parse --short HEAD)  branch: $(git -C "$ROOT" branch --show-current)"
  echo "logs:   $LOG_DIR"
  echo "==========================================================="
}

# step <label> <dir> <command...>: run, log, record PASS/FAIL, stop on failure
step() {
  local label="$1" dir="$2"; shift 2
  local log="$LOG_DIR/$(echo "$label" | tr ' /:' '___').log"
  local start=$SECONDS
  echo "▶ $label"
  if (cd "$dir" && "$@") >"$log" 2>&1; then
    RESULTS+=("PASS  $label  ($((SECONDS - start))s)")
  else
    RESULTS+=("FAIL  $label  ($((SECONDS - start))s)  -> $log")
    echo "---- last 60 lines of $log ----"; tail -n 60 "$log"
    FAILED=1
    [ "$KEEP" = 1 ] && return 1
    summary; exit 1
  fi
}

ensure_deps() { # install only when node_modules is missing or older than the lockfile
  local dir="$1"
  if [ ! -f "$dir/node_modules/.package-lock.json" ] || [ "$dir/package-lock.json" -nt "$dir/node_modules/.package-lock.json" ]; then
    step "$(basename "$dir"): npm ci" "$dir" npm ci --no-audit --no-fund
  fi
}

# ---------------------------------------------------------------- backend ----
setup_test_db() {
  local be="$CODE/backend"
  if [ -f "$be/.env.test" ]; then
    grep -q 'ecom_test' "$be/.env.test" || { RESULTS+=("FAIL  backend: .env.test does not point at ecom_test"); summary; exit 1; }
    export DATABASE_URL_TEST="$(grep -E '^DATABASE_URL=' "$be/.env.test" | head -1 | cut -d= -f2- | tr -d '"')"
    return
  fi
  if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    RESULTS+=("FAIL  backend: no .env.test and Docker is not running, so integration tests can't run")
    summary; exit 1
  fi
  local name="techistan-gate-db-$$"
  echo "▶ starting throwaway Postgres ($name on :5434)"
  docker run -d --rm --name "$name" -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=ecom_test -p 5434:5432 postgres:16 >/dev/null || { RESULTS+=("FAIL  backend: could not start Postgres container"); summary; exit 1; }
  CLEANUP+=("docker rm -f $name")
  for _ in $(seq 1 30); do docker exec "$name" pg_isready -U postgres -d ecom_test >/dev/null 2>&1 && break; sleep 1; done
  export DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5434/ecom_test?schema=public"
  cat > "$be/.env.test" <<EOF
NODE_ENV=test
DATABASE_URL=$DATABASE_URL_TEST
JWT_SECRET=test-jwt-secret
JWT_REFRESH_SECRET=test-refresh-secret
USER_APP_URL=http://localhost:3001
ADMIN_APP_URL=http://localhost:3002
ADMIN_EMAIL=admin@shopforge.dev
ADMIN_PASSWORD=Admin!2345
EOF
  CLEANUP+=("rm -f '$be/.env.test'")
}

run_backend() {
  local be="$CODE/backend"
  ensure_deps "$be"
  step "backend: prisma generate" "$be" npx prisma generate
  step "backend: lint"            "$be" npx eslint "{src,apps,libs,test}/**/*.ts"
  step "backend: build"           "$be" npm run build
  step "backend: unit + coverage" "$be" npm run test:cov -- --ci
  setup_test_db
  step "backend: migrate ecom_test" "$be" env DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy
  step "backend: integration"     "$be" npm run test:integration -- --ci
  step "backend: audit (prod, critical)" "$be" npm audit --omit=dev --audit-level=critical
}

# -------------------------------------------------------------- frontends ----
next_env() { # dummy public env so `next build` works without real keys
  export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:3000}"
  export NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-http://localhost:3001}"
  export NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="${NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:-demo}"
  export NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:-pk_test_dummy}"
  export NEXT_TELEMETRY_DISABLED=1
}

run_frontend() {
  local key="$1" dir="$2"
  ensure_deps "$dir"
  next_env
  step "$key: lint"  "$dir" npm run lint
  step "$key: test"  "$dir" npm test
  step "$key: build" "$dir" npm run build
  if [ "$key" = "user" ] && [ "$E2E" = 1 ]; then
    step "user: playwright e2e" "$dir" npx playwright test
  fi
}

for p in "${PKGS[@]}"; do
  case "$p" in
    backend) run_backend ;;
    user)    run_frontend user  "$CODE/frontend/user_client" ;;
    admin)   run_frontend admin "$CODE/frontend/admin_client" ;;
  esac
done

if [ "$FAILED" = 1 ]; then
  RESULTS+=("RESULT: FAILED (${PKGS[*]})"); summary; exit 1
fi
RESULTS+=("RESULT: ALL GREEN (${PKGS[*]})")
summary
exit 0
