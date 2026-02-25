#!/usr/bin/env bash
set -e

echo "==> Syncing database schema..."
cd apps/api
npx prisma db push --accept-data-loss

echo "==> Seeding database..."
node dist/prisma/seed.js || echo "Seed skipped (may already exist)"

echo "==> Starting API server on port 4000..."
PORT=4000 node dist/main.js &

echo "==> Waiting for API to be ready..."
sleep 3

echo "==> Starting Web server..."
cd ../web
PORT=${PORT:-10000} npx next start -p ${PORT:-10000}
