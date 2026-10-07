#!/usr/bin/env bash
# Install the independently versioned backup/monitor tools, without switching the app.
set -euo pipefail
source_dir=$(cd "$(dirname "$0")" && pwd)
version=${1:-full-audit-20260927}
[[ "$version" =~ ^[a-z0-9-]+$ ]] || exit 1
destination="/var/www/harajstation-ops/$version"
install -d -m 755 -o haraj -g haraj "$destination"
for file in backup.sh backup-offsite.mjs monitor.mjs; do
  if [ "$source_dir/$file" != "$destination/$file" ]; then
    install -m 640 -o haraj -g haraj "$source_dir/$file" "$destination/$file"
  fi
done
if [ -f "$source_dir/../scripts/r2-cleanup.mjs" ]; then
  install -m 640 -o haraj -g haraj "$source_dir/../scripts/r2-cleanup.mjs" "$destination/r2-cleanup.mjs"
fi
test -f "$destination/r2-cleanup.mjs"
ln -sfn /var/www/harajstation-releases/current/node_modules "$destination/node_modules"
bash -n "$destination/backup.sh"
node --check "$destination/backup-offsite.mjs"
node --check "$destination/monitor.mjs"
ln -sfn "$destination" /var/www/harajstation-ops/current
install -d /etc/systemd/system/haraj-monitor.service.d
cat > /etc/systemd/system/haraj-monitor.service.d/offsite.conf <<'EOF'
[Service]
ExecStart=
ExecStart=/usr/bin/node --env-file=/var/www/harajstation/.env /var/www/harajstation-ops/current/monitor.mjs
EOF
cp -p /etc/cron.d/harajstation "$destination/cron-before-install"
python3 - <<'PY'
from pathlib import Path
p=Path('/etc/cron.d/harajstation');text=p.read_text()
old='/var/www/harajstation-releases/current/deploy/backup.sh'
new='/var/www/harajstation-ops/current/backup.sh'
if old not in text and new not in text: raise SystemExit('Unknown backup schedule; preserve cron file')
text=text.replace(old,new)
marker='/var/www/harajstation-ops/current/r2-cleanup.mjs'
if marker not in text:
    text+='\n47 3 * * 0 haraj /usr/bin/node --env-file=/var/www/harajstation/.env '+marker+' --delete --avatars-only >> /var/backups/harajstation/avatar-cleanup.log 2>&1\n'
p.write_text(text)
PY
chmod 644 /etc/cron.d/harajstation
systemctl daemon-reload
echo "Backup, offsite verification and avatar-cleanup schedules installed"
