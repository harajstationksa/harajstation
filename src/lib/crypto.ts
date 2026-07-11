import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * At-rest encryption for private chat messages (AES-256-GCM).
 *
 * Messages are stored encrypted in the database and decrypted only when
 * served to one of the two conversation parties — a database leak exposes
 * no chat content. The key is derived from CHAT_SECRET (falls back to
 * AUTH_SECRET). Stored format: `enc:v1:<iv>:<tag>:<ciphertext>` (base64),
 * so legacy plaintext rows remain readable.
 */

const PREFIX = "enc:v1:";

function key(): Buffer {
  const secret = process.env.CHAT_SECRET ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    // refuse to encrypt private chats with a guessable key in production
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CHAT_SECRET or AUTH_SECRET must be set to a random value of 32+ characters in production"
      );
    }
    return createHash("sha256").update("chat|samel-insecure-dev-secret").digest();
  }
  return createHash("sha256").update(`chat|${secret}`).digest();
}

export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

export function decryptText(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  try {
    const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(":");
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "⚠️ تعذّر فك تشفير هذه الرسالة";
  }
}
