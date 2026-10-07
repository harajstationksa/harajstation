import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
let client: S3Client | undefined;
export function privateR2Configured() {
  if (!process.env.R2_PRIVATE_BUCKET) return false;
  if (process.env.R2_PRIVATE_BUCKET === process.env.R2_BUCKET)
    throw new Error("Private and public buckets must differ");
  if (
    !process.env.R2_ACCOUNT_ID ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY
  )
    throw new Error("Private R2 credentials are missing");
  return true;
}
function r2() {
  if (!privateR2Configured()) throw new Error("Private R2 is not configured");
  return (client ??= new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    requestHandler: { connectionTimeout: 5_000, requestTimeout: 15_000 },
  }));
}
function objectKey(path: string) {
  if (!/^r2:private\/[a-z-]+\/[a-f0-9-]{36}\.webp$/.test(path))
    throw new Error("Invalid private R2 key");
  return path.slice(3);
}
export async function storePrivateR2(data: Buffer, key: string) {
  const path = `r2:private/${key}`;
  const Key = objectKey(path);
  await r2().send(
    new PutObjectCommand({
      Bucket: process.env.R2_PRIVATE_BUCKET,
      Key,
      Body: data,
      ContentType: "image/webp",
      CacheControl: "private, no-store",
    }),
  );
  return path;
}
export async function deletePrivateR2(path: string) {
  await r2().send(
    new DeleteObjectCommand({ Bucket: process.env.R2_PRIVATE_BUCKET, Key: objectKey(path) }),
  );
}
export async function privateR2Response(path: string): Promise<Response> {
  try {
    const result = await r2().send(
      new GetObjectCommand({ Bucket: process.env.R2_PRIVATE_BUCKET, Key: objectKey(path) }),
    );
    if (!result.Body || !result.ContentLength || result.ContentLength > 5 * 1024 * 1024)
      throw new Error("Invalid private image");
    return new Response(result.Body.transformToWebStream(), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(result.ContentLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "not found" }, { status: 404 });
  }
}
export async function listPrivateR2(cursor?: string) {
  return r2().send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_PRIVATE_BUCKET,
      Prefix: "private/",
      MaxKeys: 100,
      ContinuationToken: cursor || undefined,
    }),
  );
}
