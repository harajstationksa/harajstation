#!/usr/bin/env bash
# Weekly logical backup of the production database (Supabase) to local disk.
# Runs as the haraj user from /etc/cron.d/haraj-backup; keeps the newest 8.
# Restore: gunzip -c db-YYYY-MM-DD.sql.gz | psql "$DIRECT_URL"
set -euo pipefail

APP_DIR=/var/www/harajstation
OUT_DIR=/var/backups/harajstation
PG_DUMP=/usr/lib/postgresql/17/bin/pg_dump   # must match the Supabase major version

DIRECT_URL=$(grep -oP '^DIRECT_URL="\K[^"]+' "$APP_DIR/.env")
out="$OUT_DIR/db-$(date +%F).sql.gz"

mkdir -p "$OUT_DIR"
"$PG_DUMP" "$DIRECT_URL" --no-owner --no-privileges | gzip > "$out.tmp"
mv "$out.tmp" "$out"

# rotate: newest 8 stay
ls -1t "$OUT_DIR"/db-*.sql.gz | tail -n +9 | xargs -r rm --

echo "$(date -Is) backup ok: $out ($(du -h "$out" | cut -f1))"
