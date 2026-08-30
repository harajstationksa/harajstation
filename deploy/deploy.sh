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

commit=$(git rev-parse --short=12 HEAD)
RELEASE_ROOT=/var/www/harajstation-releases
release="$RELEASE_ROOT/$commit-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$release"

echo "==> preparing immutable release $release"
git archive HEAD | tar -x -C "$release"
ln -s "$APP_DIR/.env" "$release/.env"
mkdir -p "$APP_DIR/private-uploads"
ln -s "$APP_DIR/private-uploads" "$release/private-uploads"
cd "$release"

echo "==> deps"
npm ci

echo "==> prisma client"
npx prisma generate

echo "==> runtime dependency audit"
npm audit --omit=dev --audit-level=high

echo "==> production configuration"
node --env-file=.env scripts/validate-production-env.cjs

echo "==> data preflight"
node --env-file=.env scripts/production-preflight.cjs

echo "==> encrypted recovery point"
bash deploy/backup.sh

# Dev machines run their own local database since 2026-07-18 — production
# schema changes arrive as checked-in migrations and are applied here.
echo "==> migrations"
npx prisma migrate deploy

echo "==> migrate legacy private chat data"
npm run migrate:chat -- --apply

chmod 700 "$APP_DIR/private-uploads"
find "$APP_DIR/private-uploads" -type d -exec chmod 700 {} +
find "$APP_DIR/private-uploads" -type f -exec chmod 600 {} +

echo "==> build"
npm run build

echo "==> restart"
if pm2 describe harajstation >/dev/null 2>&1; then
  pm2 startOrReload "$release/deploy/ecosystem.config.cjs" --update-env
else
  pm2 start "$release/deploy/ecosystem.config.cjs"
  pm2 save
fi

ln -sfn "$release" /var/www/harajstation-current

pm2 status harajstation
echo "==> health"
healthy=0
for attempt in 1 2 3 4 5 6; do
  if curl --fail --silent --show-error http://127.0.0.1:3000/api/health >/dev/null; then
    healthy=1
    break
  fi
  sleep 2
done
[ "$healthy" = 1 ] || { echo "!! health check failed after reload" >&2; exit 1; }
echo "==> done — https://harajstation.com ($release)"
