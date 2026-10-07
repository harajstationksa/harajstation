/**
 * Test environment: load .env (local dev database) but force email OFF so
 * no test ever sends real mail — routes take their emailConfigured()=false
 * branch deterministically.
 *
 * Guard: tests refuse to run against anything but a local database.
 */
import { existsSync, readFileSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
// tests always exercise the in-memory limiter — no Redis needed on dev machines
process.env.REDIS_URL = "";

const url = process.env.DATABASE_URL ?? "";
const hostname = new URL(url).hostname;
process.env.CHAT_SECRET = "isolated-local-test-chat-key-32-characters-or-longer";
if (process.env.REQUIRE_REDIS_TESTS === "true" && !process.env.TEST_REDIS_URL)
  throw new Error("Redis integration tests are required");
if (!["127.0.0.1", "localhost", "[::1]"].includes(hostname)) {
  throw new Error("Refusing to run tests: DATABASE_URL must point at a local test database.");
}
