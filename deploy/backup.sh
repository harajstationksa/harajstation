#!/usr/bin/env bash
# Daily encrypted backup of PostgreSQL plus private uploads.
# The age recipient is public. Keep its private key off the server as well.
# Optional BACKUP_REMOTE is an rclone destination for recurring off-site copies.
set -euo pipefail

APP_DIR=/var/www/harajstation
OUT_DIR=/var/backups/harajstation
PG_DUMP=$(command -v pg_dump)

read_env() { sed -n "s/^$1=[\"']\{0,1\}\([^\"']*\)[\"']\{0,1\}$/\1/p" "$APP_DIR/.env" | tail -n 1; }
DIRECT_URL=$(read_env DIRECT_URL)
RECIPIENT=$(read_env BACKUP_AGE_RECIPIENT)
REMOTE=$(read_env BACKUP_REMOTE)
[ -n "$DIRECT_URL" ] || { echo "DIRECT_URL is missing" >&2; exit 1; }
[ -n "$RECIPIENT" ] || { echo "BACKUP_AGE_RECIPIENT is missing" >&2; exit 1; }

stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
work=$(mktemp -d)
out="$OUT_DIR/haraj-$stamp.tar.gz.age"
trap 'rm -rf -- "$work"; rm -f -- "$out.tmp"' EXIT

mkdir -p -m 700 "$OUT_DIR"
"$PG_DUMP" "$DIRECT_URL" --format=custom --no-owner --no-privileges --file "$work/database.dump"
if [ -d "$APP_DIR/private-uploads" ]; then
  tar -C "$APP_DIR" -czf "$work/private-uploads.tar.gz" private-uploads
fi
printf 'created_utc=%s\napp_commit=%s\n' "$stamp" "$(git -C "$APP_DIR" rev-parse HEAD)" > "$work/manifest.txt"
tar -C "$work" -czf - . | age -r "$RECIPIENT" -o "$out.tmp"
chmod 600 "$out.tmp"
mv "$out.tmp" "$out"

# Keep 30 daily recovery points. Encrypted files may also be copied off-site.
find "$OUT_DIR" -maxdepth 1 -type f -name 'haraj-*.tar.gz.age' -mtime +30 -delete
if [ -n "$REMOTE" ]; then
  rclone copy "$out" "$REMOTE" --checksum
fi

echo "$(date -Is) encrypted backup ok: $out ($(du -h "$out" | cut -f1))"
