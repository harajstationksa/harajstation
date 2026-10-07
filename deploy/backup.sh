#!/usr/bin/env bash
# Daily encrypted backup of PostgreSQL plus private uploads.
# The age recipient is public. Keep its private key off the server as well.
# Optional BACKUP_REMOTE is an rclone destination for recurring off-site copies.
set -euo pipefail
umask 077

APP_DIR=/var/www/harajstation
OUT_DIR=/var/backups/harajstation
mkdir -p -m 700 "$OUT_DIR"
cd "$APP_DIR"
exec 9>"$OUT_DIR/.backup.lock"
flock -n 9 || exit 0
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
printf 'created_utc=%s\napp_commit=%s\n' "$stamp" "$(cat /var/www/harajstation-releases/current/RELEASE_COMMIT 2>/dev/null || git -C "$APP_DIR" rev-parse HEAD)" > "$work/manifest.txt"
recipients=(-r "$RECIPIENT")
# Additional PUBLIC recovery recipient; its private key is held off-server.
if [ -s /etc/harajstation-backup-recipient ]; then
  recipients+=(-r "$(cat /etc/harajstation-backup-recipient)")
fi
tar -C "$work" -czf - . | age "${recipients[@]}" -o "$out.tmp"
chmod 600 "$out.tmp"
mv "$out.tmp" "$out"

# Keep 30 daily recovery points. Encrypted files may also be copied off-site.
find "$OUT_DIR" -maxdepth 1 -type f -name 'haraj-*.tar.gz.age' -mtime +30 -delete
if [ -n "$REMOTE" ]; then
  rclone copy "$out" "$REMOTE" --checksum
  printf '{"checkedAt":"%s","destination":"rclone"}\n' "$(date -u +%FT%TZ)" > "$OUT_DIR/offsite-health.json"
else
  node --env-file="$APP_DIR/.env" "$(dirname "$(realpath "$0")")/backup-offsite.mjs" "$out"
fi

echo "$(date -Is) encrypted backup ok: $out ($(du -h "$out" | cut -f1))"
