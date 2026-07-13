#!/usr/bin/env bash
# حراج ستيشن — one-time server bootstrap (Ubuntu 22.04/24.04, as root).
# Safe to re-run: every step is idempotent.
#
#   bash deploy/setup-server.sh
set -euo pipefail

APP_DIR=/var/www/harajstation
LOG_DIR=/var/log/harajstation

echo "==> packages"
apt-get update -qq
apt-get install -y -qq curl git nginx ufw certbot python3-certbot-nginx

echo "==> Node.js 22"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1)" != "v22" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

echo "==> pm2"
command -v pm2 >/dev/null || npm install -g pm2

echo "==> swap (next build is memory hungry)"
if [ ! -f /swapfile ] && [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 6000 ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> directories"
mkdir -p "$APP_DIR" "$LOG_DIR"

echo
echo "Done. Next:"
echo "  1. git clone https://github.com/harajstationksa/harajstation.git $APP_DIR"
echo "  2. put the production .env in $APP_DIR/.env   (NEXT_PUBLIC_* are baked in at build time!)"
echo "  3. bash $APP_DIR/deploy/deploy.sh"
echo "  4. cp $APP_DIR/deploy/nginx/harajstation.conf /etc/nginx/sites-available/harajstation"
echo "     ln -sf /etc/nginx/sites-available/harajstation /etc/nginx/sites-enabled/harajstation"
echo "     rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx"
echo "  5. certbot --nginx -d harajstation.com -d www.harajstation.com --redirect"
echo "  6. cp $APP_DIR/deploy/haraj-cron.sh /usr/local/bin/ && chmod +x /usr/local/bin/haraj-cron.sh"
echo "     cp $APP_DIR/deploy/cron.d-harajstation /etc/cron.d/harajstation"
