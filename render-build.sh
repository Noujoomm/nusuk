#!/usr/bin/env bash
set -e

echo "==> Installing dependencies..."
npm ci --include=dev

echo "==> Generating Prisma client..."
cd apps/api
npx prisma generate

echo "==> Building API..."
npm run build

echo "==> Building Web..."
cd ../web
npm run build

echo "==> Build complete!"
