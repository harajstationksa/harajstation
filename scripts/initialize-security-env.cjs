#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { randomBytes } = require("node:crypto");
const { readFileSync, writeFileSync, chmodSync } = require("node:fs");
const { resolve } = require("node:path");

const envPath = resolve(process.cwd(), ".env");
let source = readFileSync(envPath, "utf8");
const recipient = process.env.BACKUP_RECIPIENT;
if (!recipient?.startsWith("age1")) {
  throw new Error("BACKUP_RECIPIENT must contain an age public recipient");
}

function current(key) {
  return source.match(new RegExp(`^${key}=["']?([^"'\\r\\n]*)["']?$`, "m"))?.[1];
}

function setValue(key, value) {
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  source = pattern.test(source) ? source.replace(pattern, line) : `${source.trimEnd()}\n${line}\n`;
}

setValue("PAYMENTS_ENABLED", "false");
setValue("CHAT_SECRET", current("CHAT_SECRET") || randomBytes(48).toString("hex"));
setValue("CHAT_SECRET_PREVIOUS", current("CHAT_SECRET_PREVIOUS") || "");
setValue("BACKUP_AGE_RECIPIENT", recipient);
setValue("BACKUP_REMOTE", current("BACKUP_REMOTE") || "");
setValue("REDIS_URL", current("REDIS_URL") || "redis://127.0.0.1:6379");
setValue("NEXT_PUBLIC_GA_ID", current("NEXT_PUBLIC_GA_ID") || "G-C3WN5PRQKT");

writeFileSync(envPath, source, { mode: 0o600 });
chmodSync(envPath, 0o600);
console.log("security environment initialized; payments=disabled");
