// Upload only age-encrypted recovery archives to an independent bucket.
import { createReadStream } from "node:fs";
import { stat, writeFile, rename, readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
export async function uploadBackup(file, env = process.env, client) {
  if (!/^haraj-[\dTZ-]+\.tar\.gz\.age$/.test(basename(file)))
    throw Error("Invalid encrypted backup filename");
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (!client && (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY))
    throw Error("Offsite storage is unconfigured");
  const Bucket = env.BACKUP_R2_BUCKET;
  if (!Bucket) throw Error("BACKUP_R2_BUCKET is required for independent offsite backup");
  if (Bucket === R2_BUCKET) throw Error("BACKUP_R2_BUCKET must differ from R2_BUCKET");
  const size = (await stat(file)).size;
  if (size < 100) throw Error("Backup archive is empty");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const digest = hash.digest("hex");
  const s3 =
    client ||
    new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  const Key = `backups/encrypted/${basename(file)}`;
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key,
      Body: createReadStream(file),
      ContentLength: size,
      ContentType: "application/octet-stream",
      CacheControl: "no-store",
      Metadata: { sha256: digest },
    }),
  );
  const check = await s3.send(new HeadObjectCommand({ Bucket, Key }));
  if (check.ContentLength !== size || check.Metadata?.sha256 !== digest)
    throw Error("Offsite backup verification failed");
  const downloaded = await s3.send(new GetObjectCommand({ Bucket, Key }));
  const checkHash = createHash("sha256");
  for await (const chunk of downloaded.Body) checkHash.update(chunk);
  if (checkHash.digest("hex") !== digest) throw Error("Offsite backup download checksum mismatch");
  return {
    ok: true,
    key: Key,
    bytes: size,
    sha256: digest,
    checkedAt: new Date().toISOString(),
  };
}
if (process.argv[1]?.endsWith("backup-offsite.mjs")) {
  try {
    const result = await uploadBackup(process.argv[2]);
    const state = "/var/backups/harajstation/offsite-health.json";
    await writeFile(state + ".tmp", JSON.stringify(result), { mode: 0o600 });
    await rename(state + ".tmp", state);
    console.log("Encrypted offsite backup verified");
  } catch {
    const state = "/var/backups/harajstation/offsite-health.json";
    try {
      const previous = JSON.parse(await readFile(state, "utf8").catch(() => "{}"));
      await writeFile(
        state + ".tmp",
        JSON.stringify({ ...previous, ok: false, failedAt: new Date().toISOString() }),
        { mode: 0o600 },
      );
      await rename(state + ".tmp", state);
    } catch {}
    console.error("offsite_backup_failed");
    process.exitCode = 1;
  }
}
