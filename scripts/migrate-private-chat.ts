import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../src/lib/db";
import { decryptText, encryptText } from "../src/lib/crypto";
import { deleteImages, MAX_FILE, savePrivateImage } from "../src/lib/uploads";

const apply = process.argv.includes("--apply");
let imageCandidates = 0;
let imagesMigrated = 0;
let bodiesMigrated = 0;
let failed = 0;

async function imageFile(url: string): Promise<File> {
  let bytes: Uint8Array;
  let type = "image/webp";
  if (url.startsWith("/uploads/")) {
    bytes = new Uint8Array(await readFile(join(process.cwd(), "public", url)));
  } else {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`download ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_FILE) throw new Error("attachment is over 5MB");
    bytes = new Uint8Array(await response.arrayBuffer());
    type = response.headers.get("content-type")?.split(";")[0] || type;
  }
  if (bytes.byteLength > MAX_FILE) throw new Error("attachment is over 5MB");
  const ownedBuffer = Uint8Array.from(bytes).buffer as ArrayBuffer;
  return new File([ownedBuffer], "legacy-chat-image", { type });
}

async function run() {
  const rows = await db.message.findMany({
    where: {
      OR: [
        { imageUrl: { not: null } },
        { body: { startsWith: "enc:v1:" } },
      ],
    },
    select: { id: true, body: true, imageUrl: true },
    orderBy: { id: "asc" },
  });

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
    if (row.body.startsWith("enc:v1:")) {
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
      await db.message.update({ where: { id: row.id }, data });
      if (data.imageUrl && oldImage) {
        imagesMigrated++;
        await deleteImages([oldImage]);
      }
      if (data.body) bodiesMigrated++;
    }
  }

  console.log(JSON.stringify({ apply, imageCandidates, imagesMigrated, bodiesMigrated, failed }));
  if (failed > 0) process.exitCode = 1;
}

run().finally(() => db.$disconnect());
