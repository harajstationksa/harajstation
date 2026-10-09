import { privateR2Configured, privateR2Response, listPrivateR2 } from "./private-r2";
import { createReadStream } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { db } from "./db";
import { MAX_FILE, privateUploadPath, privateUploadsRoot, deletePrivateImage } from "./uploads";

/** Authenticated callers only. Stream after validating the resolved path and file size. */
export async function privateImageResponse(path: string): Promise<Response> {
  if (path.startsWith("r2:")) return privateR2Response(path);
  const full = privateUploadPath(path);
  if (!full) return Response.json({ error: "bad path" }, { status: 400 });
  try {
    const root = await realpath(privateUploadsRoot());
    const resolved = await realpath(full);
    if (!resolved.startsWith(root + sep)) throw new Error("PATH_OUTSIDE_ROOT");
    const info = await lstat(resolved);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE)
      throw new Error("INVALID_PRIVATE_IMAGE");
    const body = Readable.toWeb(createReadStream(resolved)) as ReadableStream<Uint8Array>;
    return new Response(body, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(info.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return Response.json({ error: "not found" }, { status: 404 });
  }
}

/** Which of these private paths are still referenced — three indexed queries per batch. */
async function referencedPrivatePaths(paths: string[]): Promise<Set<string>> {
  if (!paths.length) return new Set();
  const [messages, identities, stores] = await Promise.all([
    db.message.findMany({
      where: { imageUrl: { in: paths.map((path) => `private:${path}`) } },
      select: { imageUrl: true },
    }),
    db.identityVerification.findMany({
      where: { docPath: { in: paths } },
      select: { docPath: true },
    }),
    db.storeVerification.findMany({ where: { docPath: { in: paths } }, select: { docPath: true } }),
  ]);
  return new Set([
    ...messages.map((m) => (m.imageUrl ?? "").slice("private:".length)),
    ...identities.map((v) => v.docPath),
    ...stores.map((v) => v.docPath),
  ]);
}

/** Older than 24h protects uploads that have not committed yet; cap work per tick. */
export async function cleanOrphanPrivateImages() {
  const root = privateUploadsRoot();
  let checked = 0,
    removed = 0;
  const localCursor = await db.setting.findUnique({
    where: { key: "private-local-cleanup-cursor" },
  });
  let lastPath = "",
    reachedEnd = true;
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (checked >= 200) {
        reachedEnd = false;
        return;
      }
      if (entry.isSymbolicLink()) continue;
      const full = resolve(dir, entry.name);
      if (!full.startsWith(root + sep)) continue;
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".webp")) continue;
      const path = relative(root, full).split(sep).join("/");
      if (path <= (localCursor?.value ?? "")) continue;
      const info = await lstat(full).catch(() => null);
      if (!info || info.mtimeMs > Date.now() - 86_400_000) continue;
      checked++;
      lastPath = path;
      candidates.push(path);
    }
  }
  const candidates: string[] = [];
  await walk(root);
  const referenced = await referencedPrivatePaths(candidates);
  for (const path of candidates) {
    if (referenced.has(path)) continue;
    await deletePrivateImage(path);
    removed++;
  }
  const nextLocalCursor = reachedEnd ? "" : lastPath;
  await db.setting.upsert({
    where: { key: "private-local-cleanup-cursor" },
    create: { key: "private-local-cleanup-cursor", value: nextLocalCursor },
    update: { value: nextLocalCursor },
  });
  if (privateR2Configured()) {
    const setting = await db.setting.findUnique({ where: { key: "private-r2-cleanup-cursor" } });
    const batch = await listPrivateR2(setting?.value);
    const remote = (batch.Contents ?? [])
      .filter(
        (object) =>
          object.Key &&
          object.LastModified &&
          object.LastModified.getTime() <= Date.now() - 86_400_000,
      )
      .map((object) => `r2:${object.Key}`);
    checked += remote.length;
    const referenced = await referencedPrivatePaths(remote);
    for (const path of remote) {
      if (referenced.has(path)) continue;
      await deletePrivateImage(path);
      removed++;
    }
    const value = batch.NextContinuationToken ?? "";
    await db.setting.upsert({
      where: { key: "private-r2-cleanup-cursor" },
      create: { key: "private-r2-cleanup-cursor", value },
      update: { value },
    });
  }
  return { checked, removed };
}
