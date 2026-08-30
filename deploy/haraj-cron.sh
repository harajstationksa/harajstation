#!/bin/sh
# Closes finished auctions, ends expired campaigns/PRO memberships, and expires
# stale transactions. Without it those only happen lazily when someone loads a
# page — an auction could sit "live" long past its deadline.
#
# Reads CRON_SECRET straight from the app's .env so the secret lives in exactly
# one place, and calls the app on localhost so it never touches the limiter.
ENV_FILE=/var/www/harajstation/.env

SECRET=$(sed -n 's/^CRON_SECRET=//p' "$ENV_FILE" | tr -d '"\r' | tr -d "'")
[ -n "$SECRET" ] || exit 0

curl -fsS -m 50 \
  -H "Authorization: Bearer $SECRET" \
  http://127.0.0.1:3000/api/cron > /dev/null
