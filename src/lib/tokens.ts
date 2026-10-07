import { createHash } from "node:crypto";

/** Store one-time secrets as irreversible digests; raw values only travel by email. */
export function hashOneTimeToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
