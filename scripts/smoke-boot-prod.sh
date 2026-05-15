#!/usr/bin/env bash
# scripts/smoke-boot-prod.sh
#
# Boot smoke test against a prod-like env. Catches what `pnpm typecheck`
# and `pnpm test:unit` cannot: Next.js `next build` failing on a runtime
# env that wasn't validated at typecheck time, and `instrumentation.ts`
# calling `process.exit(1)` after a swallowed throw.
#
# Lesson from 2026-05-08: typecheck + vitest passed, but the production
# boot loop-crashed for three commits in a row because env validation
# only runs at runtime. This script reproduces that runtime path locally.
#
# Usage:
#   scripts/smoke-boot-prod.sh                 # builds + boots + hits endpoints
#   scripts/smoke-boot-prod.sh --skip-build    # reuse the existing .next/
#   scripts/smoke-boot-prod.sh --negative      # also run the negative test
#                                              # (remove SESSION_HMAC_KEY,
#                                              # confirm boot exits non-zero)
#
# Requires `apps/web/.env.prod-like` (gitignored). Copy from the example:
#   cp apps/web/.env.prod-like.example apps/web/.env.prod-like
#   # then fill in the values

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
ENV_FILE="$WEB_DIR/.env.prod-like"
ENV_EXAMPLE="$WEB_DIR/.env.prod-like.example"
PORT="${SMOKE_PORT:-3500}"
HEALTH_PATH="${SMOKE_HEALTH_PATH:-/api/health}"
TIMEOUT_SECS="${SMOKE_TIMEOUT_SECS:-30}"

SKIP_BUILD=0
NEGATIVE=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --negative) NEGATIVE=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# ────────────────────────────────────────────────────────────────────
# Sanity: env file exists?
# ────────────────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE not found." >&2
  echo "   Create it from the template:" >&2
  echo "     cp $ENV_EXAMPLE $ENV_FILE" >&2
  echo "   then fill in real values (REDIS_URL, AUDIT_EXPORT_SIGN_KEY with prefix, etc)." >&2
  exit 1
fi

# ────────────────────────────────────────────────────────────────────
# Load .env.prod-like into the current shell. We deliberately do NOT
# `set -a` + source; we want explicit control over which vars cross
# into the child Next.js process. Pin to a known shape: `KEY=value`,
# blank lines and `# comments` stripped.
# ────────────────────────────────────────────────────────────────────
ENV_VARS=()
while IFS= read -r line; do
  # strip comments + blank lines
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  # accept KEY=value, reject anything else (defensive)
  if [[ "$line" =~ ^[A-Z_][A-Z0-9_]*= ]]; then
    ENV_VARS+=("$line")
  fi
done < "$ENV_FILE"

# Always force NODE_ENV=production for the test child.
ENV_VARS+=("NODE_ENV=production")

# ────────────────────────────────────────────────────────────────────
# Build (unless --skip-build)
#
# `pnpm build` runs `prisma generate && next build`. With `output:
# "standalone"` in next.config.mjs, this produces `.next/standalone/`
# which is what prod actually boots. We deliberately do NOT use
# `pnpm next start` — that uses Next's dev start path, not the
# standalone server that Render runs in production.
# ────────────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "→ Building apps/web with prod-like env (NODE_ENV=production)…"
  (
    cd "$WEB_DIR"
    env "${ENV_VARS[@]}" pnpm build
  )
  echo "✓ build OK"
else
  echo "→ Skipping build (--skip-build)"
fi

# ────────────────────────────────────────────────────────────────────
# Helper: spawn `next start` from $WEB_DIR with the prod-like env,
#         redirect logs to a file. Returns the child PID via stdout.
#         Note: `cd` is scoped via a subshell so the parent CWD survives,
#         but the `&` is OUTSIDE that subshell so $! captures pnpm's PID
#         directly (not a wrapping subshell PID).
# ────────────────────────────────────────────────────────────────────
LOGFILE_POS="$REPO_ROOT/.smoke-boot.log"
LOGFILE_NEG="$REPO_ROOT/.smoke-boot-neg.log"

spawn_server_pos() {
  rm -f "$LOGFILE_POS"
  # `pnpm start` runs the standalone server bundle (same as Render).
  ( cd "$WEB_DIR" && env "${ENV_VARS[@]}" PORT="$PORT" pnpm start ) \
    > "$LOGFILE_POS" 2>&1 &
  echo $!
}

wait_for_health() {
  local pid="$1"
  local deadline=$(( $(date +%s) + TIMEOUT_SECS ))
  while [[ $(date +%s) -lt $deadline ]]; do
    # Did the child die?
    if ! kill -0 "$pid" 2>/dev/null; then
      return 1
    fi
    if curl -fsS "http://127.0.0.1:$PORT$HEALTH_PATH" -o /dev/null -m 2; then
      return 0
    fi
    sleep 0.5
  done
  return 2
}

# ────────────────────────────────────────────────────────────────────
# Positive: boot with full env, expect /api/health to return 200
# ────────────────────────────────────────────────────────────────────
echo "→ Booting next start with full prod-like env on :$PORT…"
PID=$(spawn_server_pos)
trap 'kill "$PID" 2>/dev/null || true' EXIT INT TERM

if wait_for_health "$PID"; then
  echo "✓ boot OK ($HEALTH_PATH responded 200 within ${TIMEOUT_SECS}s)"
else
  rc=$?
  echo "❌ boot failed (rc=$rc)" >&2
  echo "   Last 80 log lines:" >&2
  tail -n 80 "$LOGFILE_POS" >&2 || true
  kill "$PID" 2>/dev/null || true
  exit 1
fi

# Hit a second endpoint to confirm the runtime is serving real content,
# not just a half-booted process.
echo "→ Hitting / (homepage)…"
if curl -fsS "http://127.0.0.1:$PORT/" -o /dev/null -m 5; then
  echo "✓ / responded 200"
else
  echo "⚠ / did not respond 200 (may be expected if homepage is wallet-gated)" >&2
fi

kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true
trap - EXIT INT TERM
echo "✓ positive smoke complete"

# ────────────────────────────────────────────────────────────────────
# Negative test: remove one required crypto key, expect boot to exit
# non-zero within a few seconds (instrumentation.ts:process.exit(1)).
# ────────────────────────────────────────────────────────────────────
if [[ "$NEGATIVE" -eq 1 ]]; then
  echo "→ Negative test: booting WITHOUT SESSION_HMAC_KEY, expecting non-zero exit…"

  # Rebuild ENV_VARS without SESSION_HMAC_KEY.
  NEG_ENV=()
  for kv in "${ENV_VARS[@]}"; do
    [[ "$kv" == SESSION_HMAC_KEY=* ]] && continue
    NEG_ENV+=("$kv")
  done

  rm -f "$LOGFILE_NEG"
  # Start the standalone server (same code path as production) in the
  # background so $! captures the pnpm PID directly. `cd` is scoped
  # via a subshell to preserve parent CWD; the `&` lives outside.
  ( cd "$WEB_DIR" && env "${NEG_ENV[@]}" PORT="$PORT" pnpm start ) \
    > "$LOGFILE_NEG" 2>&1 &
  NEG_PID=$!

  # instrumentation.ts validates env BEFORE serving any request. A
  # missing required key triggers process.exit(1) within ~1–3 seconds
  # on a warm build. 8s is a generous deadline.
  sleep 8

  if kill -0 "$NEG_PID" 2>/dev/null; then
    kill "$NEG_PID" 2>/dev/null || true
    wait "$NEG_PID" 2>/dev/null || true
    echo "❌ negative test FAILED: boot stayed alive without SESSION_HMAC_KEY" >&2
    echo "   instrumentation.ts is supposed to process.exit(1) but didn't." >&2
    echo "   Last 50 log lines:" >&2
    tail -n 50 "$LOGFILE_NEG" >&2 || true
    exit 1
  fi

  set +e
  wait "$NEG_PID"
  NEG_RC=$?
  set -e

  if [[ "$NEG_RC" -ne 0 ]]; then
    echo "✓ negative OK (boot exited rc=$NEG_RC as expected)"
  else
    echo "❌ negative test FAILED: boot exited rc=0 without the required env" >&2
    exit 1
  fi
fi

echo ""
echo "✅ smoke-boot-prod complete."
