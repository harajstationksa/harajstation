#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { URL } = require("node:url");

const missing = [];
const required = [
  "DATABASE_URL",
  "DIRECT_URL",
  "AUTH_SECRET",
  "CRON_SECRET",
  "CHAT_SECRET",
  "NEXT_PUBLIC_SITE_URL",
  "ADMIN_HOST",
  "REDIS_URL",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM",
  "BACKUP_AGE_RECIPIENT",
];
for (const key of required) if (!process.env[key]) missing.push(key);
for (const key of ["AUTH_SECRET", "CRON_SECRET", "CHAT_SECRET"]) {
  if (process.env[key] && process.env[key].length < 32) missing.push(`${key}(too short)`);
}
try {
  if (new URL(process.env.NEXT_PUBLIC_SITE_URL || "").protocol !== "https:") {
    missing.push("NEXT_PUBLIC_SITE_URL(https required)");
  }
} catch {
  missing.push("NEXT_PUBLIC_SITE_URL(invalid)");
}
if (process.env.PAYMENTS_ENABLED === "true") {
  for (const key of [
    "MOYASAR_PUBLISHABLE_KEY",
    "MOYASAR_SECRET_KEY",
    "MOYASAR_WEBHOOK_SECRET",
  ]) {
    if (!process.env[key]) missing.push(key);
  }
}
if (missing.length) {
  console.error(`Production configuration invalid: ${[...new Set(missing)].join(", ")}`);
  process.exit(1);
}
console.log(`production configuration valid; payments=${process.env.PAYMENTS_ENABLED === "true" ? "enabled" : "disabled"}`);
