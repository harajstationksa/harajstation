import { opendir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../src/lib/db";
import { privateUploadsRoot } from "../src/lib/uploads";
import { privateR2Configured, storePrivateR2 } from "../src/lib/private-r2";
const apply = process.argv.includes("--apply");
async function run() {
  if (!privateR2Configured()) throw new Error("R2_PRIVATE_BUCKET is required");
  let moved = 0;
  const root = privateUploadsRoot();
  for await (const dir of await opendir(root)) {
    if (!dir.isDirectory() || dir.isSymbolicLink()) continue;
    for await (const entry of await opendir(join(root, dir.name))) {
      if (!entry.isFile() || entry.isSymbolicLink() || !/^[a-f0-9-]{36}\.webp$/.test(entry.name))
        continue;
      const oldPath = `${dir.name}/${entry.name}`;
      const refs = await Promise.all([
        db.message.count({ where: { imageUrl: `private:${oldPath}` } }),
        db.identityVerification.count({ where: { docPath: oldPath } }),
        db.storeVerification.count({ where: { docPath: oldPath } }),
      ]);
      if (!refs.some(Boolean)) continue;
      if (!apply) {
        moved++;
        continue;
      }
      const path = await storePrivateR2(await readFile(join(root, oldPath)), oldPath);
      await db.$transaction([
        db.message.updateMany({
          where: { imageUrl: `private:${oldPath}` },
          data: { imageUrl: `private:${path}` },
        }),
        db.identityVerification.updateMany({
          where: { docPath: oldPath },
          data: { docPath: path },
        }),
        db.storeVerification.updateMany({ where: { docPath: oldPath }, data: { docPath: path } }),
      ]);
      // Legacy files remain for active old releases; orphan cleanup removes them after 24h.
      moved++;
    }
  }
  console.log(JSON.stringify({ apply, moved }));
}
run()
  .catch(() => {
    console.error("Private R2 migration failed; existing files retained");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
