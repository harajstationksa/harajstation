#!/usr/bin/env bash
# Trust CF-Connecting-IP only when the TCP peer is an official Cloudflare range.
# Run as root. The existing proxy_set_header X-Forwarded-For $remote_addr stays intact.
set -euo pipefail
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
python3 - <<'PY' > "$tmp"
import ipaddress, urllib.request, json
request=urllib.request.Request("https://api.cloudflare.com/client/v4/ips",headers={"User-Agent":"HarajStation-Nginx-RealIP/1.0"})
with urllib.request.urlopen(request,timeout=15) as response:
    payload=json.loads(response.read(65536))
if not payload.get("success"): raise SystemExit("Cloudflare IP API failed")
ranges=[]
for version in (4,6):
    parsed=[ipaddress.ip_network(line,strict=True) for line in payload["result"][f"ipv{version}_cidrs"]]
    if not parsed or any(net.version != version or net.prefixlen < (8 if version==4 else 16) for net in parsed):
        raise SystemExit("Invalid Cloudflare network list")
    ranges.extend(parsed)
print("# Official Cloudflare peer ranges; refreshed by update-cloudflare-realip.sh")
for net in ranges: print(f"set_real_ip_from {net};")
print("real_ip_header CF-Connecting-IP;")
print("real_ip_recursive on;")
PY
target=/etc/nginx/conf.d/cloudflare-realip.conf
backup=""
if [ -f "$target" ]; then backup="$target.$(date -u +%Y%m%dT%H%M%SZ).bak"; cp -p "$target" "$backup"; fi
install -m 644 "$tmp" "$target"
if ! nginx -t; then
  if [ -n "$backup" ]; then cp -p "$backup" "$target"; else rm -f "$target"; fi
  exit 1
fi
systemctl reload nginx
echo "Cloudflare peer trust installed; untrusted visitor headers remain ignored."
