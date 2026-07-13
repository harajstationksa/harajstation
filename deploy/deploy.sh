#!/usr/bin/env bash
# حراج ستيشن — build & (re)start. Run after every update:
#
#   cd /var/www/harajstation && bash deploy/deploy.sh
set -euo pipefail

APP_DIR=/var/www/harajstation
cd "$APP_DIR"

[ -f .env ] || { echo "!! .env is missing — the build bakes NEXT_PUBLIC_* into the client bundle"; exit 1; }

echo "==> pulling"
git pull --ff-only

echo "==> deps"
npm ci

echo "==> prisma client"
npx prisma generate

# The schema is pushed from the dev machine (npx prisma db push) against the
# same Supabase database, so there is nothing to apply here. If you ever point
# this at a fresh database, run `npx prisma db push` once before the build.

echo "==> build"
npm run build

echo "==> restart"
if pm2 describe harajstation >/dev/null 2>&1; then
  pm2 reload harajstation --update-env
else
  pm2 start deploy/ecosystem.config.cjs
  pm2 save
fi

pm2 status harajstation
echo "==> done — https://harajstation.com"
