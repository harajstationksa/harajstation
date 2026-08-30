import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Constant-time string comparison for shared secrets (cron key, webhook
 * token). Hashing first equalizes lengths, so nothing leaks — not even size.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * At-rest encryption for private chat messages (AES-256-GCM).
 *
 * Messages are stored encrypted in the database and decrypted only when
 * served to one of the two conversation parties. New ciphertext includes a
 * key id so CHAT_SECRET can be rotated; CHAT_SECRET_PREVIOUS is a comma-
 * separated read-only keyring. Legacy v1 rows can still use AUTH_SECRET while
 * they are migrated, but new writes never couple chat and session keys.
 */

const V1_PREFIX = "enc:v1:";
const V2_PREFIX = "enc:v2:";

function developmentSecret() {
  return "chat|samel-insecure-dev-secret";
}

function currentSecret(): string {
  const secret = process.env.CHAT_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CHAT_SECRET must be set to a random value of 32+ characters in production");
    }
    return developmentSecret();
  }
  return secret;
}

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(`chat|${secret}`).digest();
}

function keyId(secret: string): string {
  return createHash("sha256").update(`kid|${secret}`).digest("hex").slice(0, 16);
}

function readableSecrets(): string[] {
  const values = [
    process.env.CHAT_SECRET,
    ...(process.env.CHAT_SECRET_PREVIOUS ?? "").split(","),
    // v1 compatibility only; remove after all legacy rows are re-encrypted.
    process.env.AUTH_SECRET,
    process.env.NODE_ENV === "production" ? undefined : developmentSecret(),
  ];
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))];
}

export function encryptText(plain: string): string {
  const secret = currentSecret();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${V2_PREFIX}${keyId(secret)}:${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

export function decryptText(stored: string): string {
  if (!stored.startsWith(V1_PREFIX) && !stored.startsWith(V2_PREFIX)) return stored;
  const v2 = stored.startsWith(V2_PREFIX);
  const parts = stored.slice((v2 ? V2_PREFIX : V1_PREFIX).length).split(":");
  const [kid, ivB64, tagB64, dataB64] = v2
    ? parts
    : [null, parts[0], parts[1], parts[2]];
  if (!ivB64 || !tagB64 || dataB64 === undefined) {
    return "⚠️ تعذّر فك تشفير هذه الرسالة";
  }
  const candidates = readableSecrets().filter((secret) => !kid || keyId(secret) === kid);
  for (const secret of candidates) {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        keyFromSecret(secret),
        Buffer.from(ivB64, "base64")
      );
      decipher.setAuthTag(Buffer.from(tagB64, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      // Try the next key in the rotation ring.
    }
  }
  return "⚠️ تعذّر فك تشفير هذه الرسالة";
}
