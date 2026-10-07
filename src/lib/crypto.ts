import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
const PREFIXES = ["enc:v1:", "enc:v2:", "enc:v3:"] as const;
const FAILED = "⚠️ تعذّر فك تشفير هذه الرسالة";
function currentSecret() {
  const secret = process.env.CHAT_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("CHAT_SECRET must contain at least 32 characters");
  return secret;
}
function key(secret: string, version: number) {
  return version === 3
    ? Buffer.from(
        hkdfSync(
          "sha256",
          secret,
          "harajstation:chat:hkdf:v3",
          "AES-256-GCM message encryption",
          32,
        ),
      )
    : createHash("sha256").update(`chat|${secret}`).digest();
}
function keyId(secret: string) {
  return createHash("sha256").update(`kid|${secret}`).digest("hex").slice(0, 16);
}
function readableSecrets() {
  return [
    ...new Set(
      [
        process.env.CHAT_SECRET,
        ...(process.env.CHAT_SECRET_PREVIOUS ?? "").split(","),
        process.env.CHAT_LEGACY_AUTH_SECRET,
      ]
        .map((v) => v?.trim())
        .filter((v): v is string => !!v),
    ),
  ];
}
export function encryptText(plain: string): string {
  const secret = currentSecret(),
    iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret, 3), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `enc:v3:${keyId(secret)}:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}
export function decryptText(stored: string): string {
  const index = PREFIXES.findIndex((p) => stored.startsWith(p));
  if (index === -1) return stored.startsWith("enc:") ? FAILED : stored;
  const version = index + 1;
  const parts = stored.slice(PREFIXES[index].length).split(":");
  if (parts.length !== (version === 1 ? 3 : 4)) return FAILED;
  const [kid, ivB64, tagB64, dataB64] = version === 1 ? [null, ...parts] : parts;
  if (!ivB64 || !tagB64 || typeof dataB64 !== "string") return FAILED;
  const iv = Buffer.from(ivB64, "base64"),
    tag = Buffer.from(tagB64, "base64");
  if (iv.length !== 12 || tag.length !== 16) return FAILED;
  for (const secret of readableSecrets().filter((s) => !kid || keyId(s) === kid)) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key(secret, version), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      /* Try an explicitly configured previous key. */
    }
  }
  return FAILED;
}
