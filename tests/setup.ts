/**
 * Test environment: load .env (local dev database) but force email OFF so
 * no test ever sends real mail — routes take their emailConfigured()=false
 * branch deterministically.
 *
 * Guard: tests refuse to run against anything but a local database.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
// tests always exercise the in-memory limiter — no Redis needed on dev machines
delete process.env.REDIS_URL;

const url = process.env.DATABASE_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(url)) {
  throw new Error(
    "Refusing to run tests: DATABASE_URL is not a local database. " +
      "Tests create and delete rows — point it at the local dev DB."
  );
}
