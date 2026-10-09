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
RUN_ROOT=/var/www/harajstation-run
release="$RELEASE_ROOT/$commit-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$release"

echo "==> preparing immutable release $release"
git archive HEAD | tar -x -C "$release"
# version-skew id read by next.config.ts at build AND at `next start`
echo "$commit" > "$release/DEPLOYMENT_ID"
# One Server Actions encryption key for every build: without it each release
# gets a fresh key and pages opened before a deploy fail their next action.
if ! grep -q '^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=' "$APP_DIR/.env"; then
  echo "==> generating a persistent NEXT_SERVER_ACTIONS_ENCRYPTION_KEY"
  key=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')
  printf '\nNEXT_SERVER_ACTIONS_ENCRYPTION_KEY="%s"\n' "$key" >> "$APP_DIR/.env"
fi
ln -s "$APP_DIR/.env" "$release/.env"
mkdir -p "$APP_DIR/private-uploads"
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
# The database must match schema.prisma exactly, or the next `migrate dev`
# would generate destructive changes. Warn loudly; do not block a hotfix.
if ! npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
     --to-schema-datamodel prisma/schema.prisma --exit-code >/dev/null 2>&1; then
  echo "!! WARNING: production schema differs from prisma/schema.prisma — run prisma migrate diff" >&2
fi

echo "==> build"
npm run build

# Link private data only after Turbopack finishes. Following an out-of-project
# symlink during its graph walk is rejected, while the runtime can safely use
# the shared directory through authenticated routes.
ln -s "$APP_DIR/private-uploads" "$release/private-uploads"
echo "==> migrate legacy private chat data"
npm run migrate:chat -- --apply

chmod 700 "$APP_DIR/private-uploads"
find "$APP_DIR/private-uploads" -type d -exec chmod 700 {} +
find "$APP_DIR/private-uploads" -type f -exec chmod 600 {} +

echo "==> restart"
mkdir -p "$RUN_ROOT"
cp "$release/deploy/start-release.cjs" "$RUN_ROOT/start-release.cjs"
chmod 755 "$RUN_ROOT/start-release.cjs"
previous=$(readlink -f "$RELEASE_ROOT/current" 2>/dev/null || true)
ln -sfn "$release" "$RELEASE_ROOT/current"
if pm2 describe harajstation 2>/dev/null | grep -q "$RUN_ROOT/start-release.cjs"; then
  pm2 reload "$release/deploy/ecosystem.config.cjs" --update-env
else
  # One-time migration from the legacy in-place process definition.
  pm2 delete harajstation >/dev/null 2>&1 || true
  pm2 start "$release/deploy/ecosystem.config.cjs"
  pm2 save
fi

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
if [ "$healthy" != 1 ]; then
  echo "!! health check failed after reload" >&2
  if [ -n "$previous" ] && [ -d "$previous" ] && [ "$previous" != "$release" ]; then
    echo "!! rolling back to $previous" >&2
    ln -sfn "$previous" "$RELEASE_ROOT/current"
    pm2 reload "$previous/deploy/ecosystem.config.cjs" --update-env || true
  fi
  exit 1
fi

# Keep the five newest releases (each is ~1.2GB with node_modules + .next);
# never delete the running one or the one just replaced.
echo "==> pruning old releases"
current_target=$(readlink -f "$RELEASE_ROOT/current")
ls -1dt "$RELEASE_ROOT"/*/ 2>/dev/null | sed 's:/$::' | tail -n +6 | while read -r old; do
  [ "$(basename "$old")" = current ] && continue
  [ -L "$old" ] && continue
  [ "$old" = "$current_target" ] && continue
  [ "$old" = "$previous" ] && continue
  case "$old" in "$RELEASE_ROOT"/*) rm -rf -- "$old" ;; esac
done
echo "==> done — https://harajstation.com ($release)"
