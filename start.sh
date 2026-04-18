#!/bin/bash
# Single-container process supervisor.
#
# The API (Nest, internal port) and the Next.js standalone server (public PORT)
# run in one Railway container. Next.js proxies /api/*, /health, /socket.io,
# and /uploads/* to the API via next.config.js rewrites. This script starts the
# API, waits for it to become healthy locally, then execs the web server in the
# foreground so Railway's signals reach it directly.
#
# DB migration (prisma db push), seed, and backfills DO NOT run here — they run
# in Railway's preDeployCommand (`npm run db:deploy`) once per deploy. Running
# them per-container on multi-replica setups is wrong and slow.

set -euo pipefail

API_PORT="${API_PORT:-4000}"
PORT="${PORT:-3000}"

echo "=========================================="
echo "  RUYA PLATFORM — STARTUP"
echo "  NODE_ENV=${NODE_ENV:-development}"
echo "  PORT=${PORT}  API_PORT=${API_PORT}"
echo "=========================================="

# Fail fast on missing secrets rather than crashing deep inside NestJS.
MISSING=""
[ -z "${DATABASE_URL:-}" ] && MISSING="$MISSING DATABASE_URL"
[ -z "${JWT_SECRET:-}" ] && MISSING="$MISSING JWT_SECRET"
[ -z "${JWT_REFRESH_SECRET:-}" ] && MISSING="$MISSING JWT_REFRESH_SECRET"
if [ -n "$MISSING" ]; then
  echo "!! MISSING ENV VARS:$MISSING" >&2
  exit 1
fi

# ─── API (background) ─────────────────────────────────────────────────────
API_PORT="$API_PORT" node apps/api/dist/src/main.js > /tmp/api.log 2>&1 &
API_PID=$!

# Wait up to 60s for /health. Surface the API log if it crashes so the
# Railway deploy log contains the actual error, not "API not ready".
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" > /dev/null 2>&1; then
    echo "API healthy on :$API_PORT (pid $API_PID)"
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "!! API crashed during startup. Last logs:" >&2
    cat /tmp/api.log >&2 || true
    exit 1
  fi
  sleep 1
done

# If the container dies, kill the API too.
trap 'kill $API_PID 2>/dev/null || true' EXIT
# Stream API logs to stdout so Railway captures them.
tail -f /tmp/api.log &

# ─── Web (foreground) ─────────────────────────────────────────────────────
export API_INTERNAL_URL="http://127.0.0.1:${API_PORT}"

# Next.js standalone output puts server.js under apps/web/.next/standalone/...
# Copy static assets into the standalone tree, then exec the server so PID 1
# is node and Railway's SIGTERM stops it cleanly.
STANDALONE_ROOT=""
if [ -f "apps/web/.next/standalone/apps/web/server.js" ]; then
  STANDALONE_ROOT="apps/web/.next/standalone/apps/web"
elif [ -f "apps/web/.next/standalone/server.js" ]; then
  STANDALONE_ROOT="apps/web/.next/standalone"
fi

if [ -n "$STANDALONE_ROOT" ]; then
  mkdir -p "$STANDALONE_ROOT/.next"
  cp -r apps/web/.next/static "$STANDALONE_ROOT/.next/static" 2>/dev/null || true
  cp -r apps/web/public "$STANDALONE_ROOT/public" 2>/dev/null || true
  PORT="$PORT" HOSTNAME=0.0.0.0 exec node "$STANDALONE_ROOT/server.js"
fi

# Fallback: no standalone build was produced.
echo "!! Next.js standalone build missing; falling back to 'next start'" >&2
exec npx --prefix apps/web next start -p "$PORT" -H 0.0.0.0
