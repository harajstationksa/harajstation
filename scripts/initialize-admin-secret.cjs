/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  crypto = require("node:crypto");
if (!process.argv.includes("--apply"))
  throw new Error("Use --apply to initialize ADMIN_AUTH_SECRET");
let text = fs.readFileSync(".env", "utf8");
const existing = text.match(/^ADMIN_AUTH_SECRET=["']?([^"'\r\n]*)/m)?.[1];
const site = text.match(/^AUTH_SECRET=["']?([^"'\r\n]*)/m)?.[1];
if (!existing || existing.length < 32 || existing === site) {
  const line = 'ADMIN_AUTH_SECRET="' + crypto.randomBytes(48).toString("hex") + '"';
  text = /^ADMIN_AUTH_SECRET=.*$/m.test(text)
    ? text.replace(/^ADMIN_AUTH_SECRET=.*$/m, line)
    : text.trimEnd() + "\n" + line + "\n";
  fs.writeFileSync(".env", text, { mode: 0o600 });
  fs.chmodSync(".env", 0o600);
  console.log("Independent admin key initialized without displaying it");
} else console.log("Independent admin key already configured");
