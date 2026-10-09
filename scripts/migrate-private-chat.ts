import { readPublicImage } from "../src/lib/public-image-source";
import { join } from "node:path";
import { db } from "../src/lib/db";
import { decryptText, encryptText } from "../src/lib/crypto";
import { deleteImages, deletePrivateImage, MAX_FILE, savePrivateImage } from "../src/lib/uploads";

const apply = process.argv.includes("--apply");
// Explicit, migration-only read key; never used by application runtime.
process.env.CHAT_LEGACY_AUTH_SECRET ||= process.env.AUTH_SECRET;
let imageCandidates = 0;
let imagesMigrated = 0;
let bodiesMigrated = 0;
let failed = 0;

async function imageFile(url: string): Promise<File> {
  const bytes = await readPublicImage(
    url,
    join(process.cwd(), "public"),
    process.env.R2_PUBLIC_URL,
  );
  if (!bytes || bytes.byteLength > MAX_FILE) throw new Error("Invalid legacy attachment");
  return new File([Uint8Array.from(bytes)], "legacy-chat-image.webp", { type: "image/webp" });
}

async function run() {
  let cursor: string | undefined;
  while (true) {
    const rows = await db.message.findMany({
      where: {
        OR: [
          { imageUrl: { not: null } },
          { AND: [{ body: { not: "" } }, { NOT: { body: { startsWith: "enc:v3:" } } }] },
        ],
      },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, body: true, imageUrl: true },
      orderBy: { id: "asc" },
    });

    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    for (const row of rows) {
      const data: { imageUrl?: string; body?: string } = {};
      const oldImage = row.imageUrl;
      if (oldImage && !oldImage.startsWith("private:")) {
        imageCandidates++;
        if (apply) {
          try {
            const saved = await savePrivateImage(await imageFile(oldImage), "chat");
            if (!saved.ok) throw new Error(saved.error);
            data.imageUrl = `private:${saved.path}`;
          } catch (error) {
            failed++;
            console.error(`message ${row.id}: image migration failed`, error);
          }
        }
      }
      if (row.body && !row.body.startsWith("enc:v3:")) {
        if (apply) {
          const plain = decryptText(row.body);
          if (plain.startsWith("⚠️")) {
            failed++;
            console.error(`message ${row.id}: legacy body could not be decrypted`);
          } else {
            data.body = encryptText(plain);
          }
        }
      }
      if (apply && Object.keys(data).length > 0) {
        const changed = await db.message.updateMany({
          where: { id: row.id, body: row.body, imageUrl: row.imageUrl },
          data,
        });
        if (!changed.count) {
          if (data.imageUrl) await deletePrivateImage(data.imageUrl.slice(8));
          continue;
        }
        if (data.imageUrl && oldImage) {
          imagesMigrated++;
          await deleteImages([oldImage]);
        }
        if (data.body) bodiesMigrated++;
      }
    }
  }
  console.log(JSON.stringify({ apply, imageCandidates, imagesMigrated, bodiesMigrated, failed }));
  if (failed > 0) process.exitCode = 1;
}

run().finally(() => db.$disconnect());
