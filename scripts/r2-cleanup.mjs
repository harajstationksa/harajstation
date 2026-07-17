/**
 * R2 orphan cleanup — deletes bucket objects that no database row references.
 *
 * Dry-run by default (prints what WOULD be deleted):
 *   node scripts/r2-cleanup.mjs
 * Actually delete:
 *   node scripts/r2-cleanup.mjs --delete
 *
 * Safety rails:
 *  - objects newer than 24h are never touched (an upload may be mid-publish)
 *  - reads every image reference in the DB: listing photos, avatars, store
 *    logos/banners, chat attachments, admin banners, dispute evidence
 */
import { readFileSync } from "node:fs";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

// minimal .env loader — plain node doesn't read it and dotenv isn't a dep
try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* no .env file — rely on the ambient environment */
}

const DELETE = process.argv.includes("--delete");
const MIN_AGE_MS = 24 * 3600 * 1000;

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } =
  process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
  console.error("R2_* env vars missing — run from the project root with .env present.");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});
const db = new PrismaClient();
const publicBase = R2_PUBLIC_URL.replace(/\/$/, "");

/** URL → bucket key (null when the URL points elsewhere, e.g. placeholders). */
function keyOf(url) {
  if (!url) return null;
  if (url.startsWith(`${publicBase}/`)) return decodeURI(url.slice(publicBase.length + 1));
  return null;
}

async function referencedKeys() {
  const keys = new Set();
  const add = (url) => {
    const k = keyOf(url);
    if (k) keys.add(k);
  };

  const [listings, users, stores, messages, banners, evidences] = await Promise.all([
    db.listing.findMany({ select: { images: true } }),
    db.user.findMany({ where: { avatarUrl: { not: null } }, select: { avatarUrl: true } }),
    db.store.findMany({ select: { logoUrl: true, bannerUrl: true } }),
    db.message.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
    db.banner.findMany({ select: { imageUrl: true, mobileImageUrl: true } }),
    db.evidence.findMany({ where: { fileUrl: { not: null } }, select: { fileUrl: true } }),
  ]);

  for (const l of listings) {
    try {
      for (const u of JSON.parse(l.images || "[]")) add(u);
    } catch {
      /* malformed json — nothing to keep */
    }
  }
  for (const u of users) add(u.avatarUrl);
  for (const s of stores) {
    add(s.logoUrl);
    add(s.bannerUrl);
  }
  for (const m of messages) add(m.imageUrl);
  for (const b of banners) {
    add(b.imageUrl);
    add(b.mobileImageUrl);
  }
  for (const e of evidences) add(e.fileUrl);
  return keys;
}

async function allObjects() {
  const objects = [];
  let ContinuationToken;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET, ContinuationToken })
    );
    for (const o of page.Contents ?? []) {
      objects.push({ key: o.Key, size: o.Size ?? 0, modified: o.LastModified });
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return objects;
}

const [referenced, objects] = await Promise.all([referencedKeys(), allObjects()]);
const now = Date.now();

const orphans = objects.filter(
  (o) =>
    !referenced.has(o.key) &&
    (!o.modified || now - o.modified.getTime() > MIN_AGE_MS)
);
const totalMB = (orphans.reduce((s, o) => s + o.size, 0) / 1024 / 1024).toFixed(1);

console.log(`bucket objects: ${objects.length}`);
console.log(`referenced in DB: ${referenced.size}`);
console.log(`orphans (older than 24h): ${orphans.length} — ${totalMB} MB`);
for (const o of orphans) console.log(`  ${DELETE ? "DELETE" : "would delete"}  ${o.key}`);

if (DELETE && orphans.length > 0) {
  for (let i = 0; i < orphans.length; i += 1000) {
    const batch = orphans.slice(i, i + 1000);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET,
        Delete: { Objects: batch.map((o) => ({ Key: o.key })), Quiet: true },
      })
    );
  }
  console.log(`\ndeleted ${orphans.length} objects (${totalMB} MB freed).`);
} else if (!DELETE) {
  console.log("\ndry-run only — rerun with --delete to actually remove them.");
}

await db.$disconnect();
