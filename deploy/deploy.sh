#!/usr/bin/env bash
# حراج ستيشن — build & (re)start. Run after every update:
#
#   cd /var/www/harajstation && bash deploy/deploy.sh
set -euo pipefail

# The app runs under the unprivileged `haraj` user (never root). When invoked
# as root, drop to that user so pm2 talks to the daemon that owns the app.
if [ "$(id -un)" = "root" ]; then
  exec sudo -u haraj -H bash "$0" "$@"
fi

APP_DIR=/var/www/harajstation
cd "$APP_DIR"

[ -f .env ] || { echo "!! .env is missing — the build bakes NEXT_PUBLIC_* into the client bundle"; exit 1; }

echo "==> pulling"
git pull --ff-only

echo "==> deps"
npm ci

echo "==> prisma client"
npx prisma generate

# Dev machines run their own local database since 2026-07-18 — production
# schema changes arrive as checked-in migrations and are applied here.
echo "==> migrations"
npx prisma migrate deploy

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
