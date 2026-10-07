#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { randomBytes } = require("node:crypto");
const { chmodSync, readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

if (!process.argv.includes("--apply")) {
  console.error("Refusing to rotate secrets without --apply");
  process.exit(2);
}

const envPath = resolve(process.cwd(), ".env");
let source = readFileSync(envPath, "utf8");
for (const key of ["AUTH_SECRET", "CRON_SECRET"]) {
  const line = `${key}="${randomBytes(48).toString("hex")}"`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (!pattern.test(source)) throw new Error(`${key} is missing from .env`);
  source = source.replace(pattern, line);
}
writeFileSync(envPath, source, { mode: 0o600 });
chmodSync(envPath, 0o600);
console.log("AUTH_SECRET and CRON_SECRET rotated; existing sessions are revoked");
