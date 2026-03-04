#!/bin/bash

echo "=========================================="
echo "  NUSUK PLATFORM - STARTUP"
echo "=========================================="
echo "NODE_ENV: ${NODE_ENV:-development}"
echo "PORT (web): ${PORT:-3000}"
echo "API_PORT: 4000"
echo "DATABASE_URL: ${DATABASE_URL:+SET (${DATABASE_URL:0:30}...)}"
echo "DATABASE_URL: ${DATABASE_URL:-!! MISSING !!}"
echo "JWT_SECRET: ${JWT_SECRET:+SET}"
echo "JWT_SECRET: ${JWT_SECRET:-!! MISSING !!}"
echo "JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:+SET}"
echo "JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:-!! MISSING !!}"
echo ""

# Check required env vars
MISSING=""
[ -z "$DATABASE_URL" ] && MISSING="$MISSING DATABASE_URL"
[ -z "$JWT_SECRET" ] && MISSING="$MISSING JWT_SECRET"
[ -z "$JWT_REFRESH_SECRET" ] && MISSING="$MISSING JWT_REFRESH_SECRET"

if [ -n "$MISSING" ]; then
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "!! MISSING ENV VARS:$MISSING"
  echo "!! API WILL CRASH WITHOUT THESE!"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo ""
fi

echo "[1/4] Running Prisma db push..."
cd apps/api
npx prisma db push --accept-data-loss 2>&1 || echo "!! Prisma db push failed (continuing...)"

echo "[2/4] Running seed..."
node dist/prisma/seed.js 2>&1 || echo "!! Seed skipped or failed (continuing...)"

echo "[3/4] Starting API on port 4000..."
API_PORT=4000 node dist/src/main.js &
API_PID=$!

# Wait for API to be ready
echo "Waiting for API to start..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:4000/health > /dev/null 2>&1; then
    echo "API is healthy! (took ${i}s)"
    break
  fi
  if ! kill -0 $API_PID 2>/dev/null; then
    echo "!! API process crashed (PID $API_PID). Check logs above."
    break
  fi
  sleep 1
done

# Final API check
if curl -sf http://localhost:4000/health > /dev/null 2>&1; then
  echo "=========================================="
  echo "  API: RUNNING on port 4000"
  echo "=========================================="
else
  echo "=========================================="
  echo "  !! API: NOT RUNNING - login will fail"
  echo "=========================================="
fi

echo "[4/4] Starting Next.js on port ${PORT:-3000}..."
cd ../web

# Use standalone server if available, otherwise fall back to next start
if [ -f .next/standalone/server.js ]; then
  echo "Using standalone server..."
  PORT=${PORT:-3000} HOSTNAME=0.0.0.0 exec node .next/standalone/server.js
else
  echo "Using next start..."
  exec npx next start -p ${PORT:-3000} -H 0.0.0.0
fi
