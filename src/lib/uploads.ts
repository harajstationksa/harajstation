import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const MAX_FILE = 5 * 1024 * 1024; // 5MB

// ── storage backend: Cloudflare R2 when fully configured, local disk otherwise ──
function r2Configured() {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET &&
    process.env.R2_PUBLIC_URL
  );
}

let s3: S3Client | null = null;
function r2Client(): S3Client {
  s3 ??= new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return s3;
}

/** Store a processed WebP under `key` and return its public URL. */
async function storePublicImage(webp: Buffer, key: string): Promise<string> {
  if (r2Configured()) {
    await r2Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: webp,
        ContentType: "image/webp",
        // uploads are immutable (uuid names) — let the CDN cache forever
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
    return `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;
  }
  const full = join(process.cwd(), "public", "uploads", key);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, webp);
  return `/uploads/${key}`;
}
export const ALLOWED_IMAGE = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export type UploadResult =
  | { ok: true; urls: string[] }
  | { ok: false; error: string };

/** Real content check — the declared MIME type is attacker-controlled. */
function sniffImage(buf: Buffer): "jpg" | "png" | "webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (
    buf.length > 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  ) {
    return "png";
  }
  if (
    buf.length > 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Persist image files (R2 or /public/uploads) and return their URLs.
 * Every image is verified by magic bytes (not just the declared type),
 * re-encoded to WebP, and capped at 1600px wide — this both compresses
 * uploads and strips any embedded payloads/EXIF.
 */
export async function saveImages(files: File[], subdir = ""): Promise<UploadResult> {
  const urls: string[] = [];
  if (files.length === 0) return { ok: true, urls };
  for (const file of files) {
    if (!ALLOWED_IMAGE.has(file.type)) {
      return { ok: false, error: "صيغة صورة غير مدعومة — استخدم JPG أو PNG أو WebP" };
    }
    if (file.size > MAX_FILE) {
      return { ok: false, error: "حجم الصورة يتجاوز 5 ميجابايت" };
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (!sniffImage(buf)) {
      return { ok: false, error: "الملف ليس صورة صالحة" };
    }
    let webp: Buffer;
    try {
      webp = await sharp(buf)
        .rotate() // apply EXIF orientation before it is stripped
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      return { ok: false, error: "تعذّرت معالجة الصورة — جرّب صورة أخرى" };
    }
    const name = `${randomUUID()}.webp`;
    const key = subdir ? `${subdir}/${name}` : name;
    try {
      urls.push(await storePublicImage(webp, key));
    } catch (e) {
      console.error("image store failed:", e);
      return { ok: false, error: "تعذّر حفظ الصورة — حاول مجدداً" };
    }
  }
  return { ok: true, urls };
}

/** Absolute root of the private (never web-served) uploads area. */
export function privateUploadsRoot() {
  return join(process.cwd(), "private-uploads");
}

/**
 * Persist a sensitive image (e.g. an ID document) OUTSIDE /public so it can
 * only be read through an authenticated route. Same magic-byte check and
 * WebP re-encode as saveImages. Returns the path relative to the private root.
 */
export async function savePrivateImage(
  file: File,
  subdir: string
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (!ALLOWED_IMAGE.has(file.type)) {
    return { ok: false, error: "صيغة صورة غير مدعومة — استخدم JPG أو PNG أو WebP" };
  }
  if (file.size > MAX_FILE) {
    return { ok: false, error: "حجم الصورة يتجاوز 5 ميجابايت" };
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (!sniffImage(buf)) {
    return { ok: false, error: "الملف ليس صورة صالحة" };
  }
  let webp: Buffer;
  try {
    webp = await sharp(buf)
      .rotate()
      .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
  } catch {
    return { ok: false, error: "تعذّرت معالجة الصورة — جرّب صورة أخرى" };
  }
  const dir = join(privateUploadsRoot(), subdir);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.webp`;
  await writeFile(join(dir, name), webp);
  return { ok: true, path: `${subdir}/${name}` };
}
