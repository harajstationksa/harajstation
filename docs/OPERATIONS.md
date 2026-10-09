# Operations Runbook

## Staging

Create a separate staging project with its own domain, PostgreSQL database, R2 buckets, Redis instance, and secret set. Never point staging at production data. Deploy pull requests to staging after CI passes, and keep production deploys behind an explicit approval.

## Secret rotation

Rotate secrets quarterly and immediately after suspected exposure. The order is: create the new credential in the provider, add it to the environment, deploy/restart, verify the integration, then revoke the old credential. Rotate `AUTH_SECRET`, `ADMIN_AUTH_SECRET`, `CRON_SECRET`, `CHAT_SECRET`, SMTP, R2, Moyasar webhook, and VAPID keys. Keep `CHAT_SECRET_PREVIOUS` only for the short migration window.

## Backup restore drill

Quarterly, restore the newest encrypted archive into an isolated database and storage prefix. Verify the manifest, database row counts, a sample private upload, and application health. Record the result and timestamp in the operations log; an untested backup is not a recovery plan.

## Error tracking

When a Sentry account is available, install the SDK with `SENTRY_DSN`, strip personal data from breadcrumbs, and alert on error rate and latency. PM2 logs and the health monitor remain the fallback until the SDK is configured.

## External product integrations

Payments require a live Moyasar account and webhook secret; SMS OTP requires a Saudi provider contract. Both stay disabled until their provider, privacy notice, rate limits, and end-to-end tests are approved.
