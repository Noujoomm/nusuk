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

API_PORT="${API_PORT:-4000}"

# Check required env vars
MISSING=""
[ -z "$DATABASE_URL" ] && MISSING="$MISSING DATABASE_URL"
[ -z "$JWT_SECRET" ] && MISSING="$MISSING JWT_SECRET"
[ -z "$JWT_REFRESH_SECRET" ] && MISSING="$MISSING JWT_REFRESH_SECRET"

if [ -n "$MISSING" ]; then
  echo "!! CRITICAL: MISSING ENV VARS:$MISSING"
  exit 1
fi

# Auto-append sslmode=require for external managed databases
if echo "$DATABASE_URL" | grep -qE '\.(render\.com|onrender\.com|railway\.app|neon\.tech|supabase\.co)'; then
  if ! echo "$DATABASE_URL" | grep -q 'sslmode='; then
    if echo "$DATABASE_URL" | grep -q '?'; then
      export DATABASE_URL="${DATABASE_URL}&sslmode=require"
    else
      export DATABASE_URL="${DATABASE_URL}?sslmode=require"
    fi
    echo "Auto-appended sslmode=require"
  fi
fi

cd apps/api || { echo "!! apps/api not found"; exit 1; }

echo "[1/4] Prisma db push (schema sync)..."
npx prisma db push --accept-data-loss 2>&1
DB_PUSH_EXIT=$?
if [ $DB_PUSH_EXIT -ne 0 ]; then
  echo "=========================================="
  echo "!! FATAL: prisma db push failed (exit $DB_PUSH_EXIT)"
  echo "!! Database schema is out of sync."
  echo "!! The API cannot start safely."
  echo "=========================================="
  exit 1
fi
echo "DB push succeeded."

echo "[2/5] Running backfill..."
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const rows = await p.custody.findMany();
  let n = 0;
  for (const c of rows) {
    const u = {};
    if (!c.code) u.code = 'CUS-' + c.id.slice(-8).toUpperCase();
    if (c.initialBalance == null) u.initialBalance = c.totalAmount || 0;
    if (c.currentBalance == null) u.currentBalance = c.remainingAmount || 0;
    if (!c.balanceAddedAt) u.balanceAddedAt = c.createdAt;
    if (Object.keys(u).length > 0) { await p.custody.update({ where: { id: c.id }, data: u }); n++; }
  }
  console.log('Backfill: ' + n + '/' + rows.length + ' custodies updated');
  await p.\$disconnect();
})().catch(e => { console.log('Backfill skip: ' + e.message); });
" 2>&1 || echo "Backfill skipped (non-fatal)"

# Fix old reports with midnight UTC (shows as 3AM Saudi)
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const reports = await p.report.findMany({ where: { submittedAt: null } });
  let n = 0;
  for (const r of reports) {
    const sub = r.createdAt || r.reportDate;
    const type = r.type || 'daily';
    const next = new Date(sub);
    if (type === 'daily') next.setHours(next.getHours() + 24);
    else if (type === 'weekly') next.setDate(next.getDate() + 7);
    else next.setDate(next.getDate() + 30);
    await p.report.update({ where: { id: r.id }, data: { submittedAt: sub, nextUpdateAt: next, reportDate: sub } });
    n++;
  }
  if (n > 0) console.log('Reports backfill: ' + n + ' reports updated with actual timestamps');
  await p.\$disconnect();
})().catch(e => { console.log('Reports backfill skip: ' + e.message); });
" 2>&1 || echo "Reports backfill skipped (non-fatal)"

echo "[3/5] Running seed..."
node dist/prisma/seed.js 2>&1 || echo "Seed skipped (non-fatal)"

echo "[4/5] Starting API on port $API_PORT..."
API_PORT=$API_PORT node dist/src/main.js > /tmp/api.log 2>&1 &
API_PID=$!

echo "Waiting for API (PID $API_PID)..."
API_READY=false
for i in $(seq 1 45); do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" > /dev/null 2>&1; then
    echo "API is healthy! (took ${i}s)"
    API_READY=true
    break
  fi
  if ! kill -0 $API_PID 2>/dev/null; then
    echo "!! API process CRASHED. Logs:"
    cat /tmp/api.log
    exit 1
  fi
  sleep 1
done

if [ "$API_READY" = true ]; then
  echo "=========================================="
  echo "  API: RUNNING on 127.0.0.1:$API_PORT"
  echo "=========================================="
  tail -f /tmp/api.log &
else
  echo "!! API: NOT READY after 45s. Logs:"
  cat /tmp/api.log
  exit 1
fi

cd ../web || { echo "!! apps/web not found"; exit 1; }

export API_INTERNAL_URL="http://127.0.0.1:${API_PORT}"
echo "API_INTERNAL_URL set to: $API_INTERNAL_URL"

echo "[5/5] Starting Next.js on port ${PORT:-3000}..."

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
