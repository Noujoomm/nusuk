#!/bin/bash

echo "=========================================="
echo "  RUYA PLATFORM - STARTUP"
echo "=========================================="
echo "NODE_ENV:          ${NODE_ENV:-development}"
echo "PORT (public):     ${PORT:-3000}"
echo "API_PORT:          ${API_PORT:-4000}"
echo "DATABASE_URL:      ${DATABASE_URL:+SET}${DATABASE_URL:-MISSING}"
echo "JWT_SECRET:        ${JWT_SECRET:+SET}${JWT_SECRET:-MISSING}"
echo "JWT_REFRESH_SECRET:${JWT_REFRESH_SECRET:+SET}${JWT_REFRESH_SECRET:-MISSING}"
echo "=========================================="

# Determine API port
API_PORT="${API_PORT:-4000}"

# Check required env vars
MISSING=""
[ -z "$DATABASE_URL" ] && MISSING="$MISSING DATABASE_URL"
[ -z "$JWT_SECRET" ] && MISSING="$MISSING JWT_SECRET"
[ -z "$JWT_REFRESH_SECRET" ] && MISSING="$MISSING JWT_REFRESH_SECRET"

if [ -n "$MISSING" ]; then
  echo ""
  echo "!! CRITICAL: MISSING ENV VARS:$MISSING"
  echo "!! API WILL CRASH WITHOUT THESE!"
  echo ""
fi

# Navigate to API directory
cd apps/api || { echo "!! apps/api not found"; exit 1; }

echo "[1/4] Running Prisma db push..."
npx prisma db push --accept-data-loss 2>&1 || echo "!! Prisma db push failed (continuing...)"

echo "[2/4] Running seed..."
node dist/prisma/seed.js 2>&1 || echo "!! Seed skipped or failed (continuing...)"

echo "[3/4] Starting API on port $API_PORT..."
API_PORT=$API_PORT node dist/src/main.js > /tmp/api.log 2>&1 &
API_PID=$!

# Wait for API to be ready (up to 45 seconds — external DB may be slow)
echo "Waiting for API (PID $API_PID)..."
API_READY=false
for i in $(seq 1 45); do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" > /dev/null 2>&1; then
    echo "API is healthy! (took ${i}s)"
    API_READY=true
    break
  fi
  if ! kill -0 $API_PID 2>/dev/null; then
    echo "!! API process CRASHED (PID $API_PID). Logs:"
    cat /tmp/api.log
    break
  fi
  sleep 1
done

if [ "$API_READY" = true ]; then
  echo "=========================================="
  echo "  API: RUNNING on 127.0.0.1:$API_PORT"
  echo "=========================================="
  # Stream API logs to stdout in background
  tail -f /tmp/api.log &
else
  echo "=========================================="
  echo "  !! API: NOT RUNNING — crash logs:"
  echo "=========================================="
  cat /tmp/api.log
  echo ""
  echo "!! Starting frontend anyway (API may recover)..."
fi

# Navigate to web directory
cd ../web || { echo "!! apps/web not found"; exit 1; }

# Set API_INTERNAL_URL so Next.js rewrites target the co-located API
# In single-container (Railway/Render), both processes share 127.0.0.1
export API_INTERNAL_URL="http://127.0.0.1:${API_PORT}"
echo "API_INTERNAL_URL set to: $API_INTERNAL_URL"

echo "[4/4] Starting Next.js on port ${PORT:-3000}..."

# Standalone server (required for output: 'standalone')
# Try monorepo path first, then flat path
if [ -f ".next/standalone/apps/web/server.js" ]; then
  echo "Using standalone server (monorepo path)..."
  cp -r .next/static .next/standalone/apps/web/.next/static 2>/dev/null || true
  cp -r public .next/standalone/apps/web/public 2>/dev/null || true
  cd .next/standalone/apps/web
  PORT=${PORT:-3000} HOSTNAME=0.0.0.0 exec node server.js
elif [ -f ".next/standalone/server.js" ]; then
  echo "Using standalone server (flat path)..."
  cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
  cp -r public .next/standalone/public 2>/dev/null || true
  cd .next/standalone
  PORT=${PORT:-3000} HOSTNAME=0.0.0.0 exec node server.js
else
  echo "!! No standalone server found, falling back to next start..."
  exec npx next start -p ${PORT:-3000} -H 0.0.0.0
fi
