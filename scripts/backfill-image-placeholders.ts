import { resolve } from "node:path";
import { db } from "../src/lib/db";
import { createImagePreview } from "../src/lib/image-preview";
import { publicImageSource, readPublicImage } from "../src/lib/public-image-source";

async function main() {
  const apply = process.argv.includes("--apply");
  const [listings, banners, stores, users, existing] = await Promise.all([
    db.listing.findMany({ select: { images: true } }),
    db.banner.findMany({ select: { imageUrl: true, mobileImageUrl: true } }),
    db.store.findMany({ select: { logoUrl: true, bannerUrl: true } }),
    db.user.findMany({ where: { avatarUrl: { not: null } }, select: { avatarUrl: true } }),
    db.imagePlaceholder.findMany({ select: { url: true } }),
  ]);
  const urls = new Set<string>(["/images/ph/chair1.svg"]);
  for (const listing of listings) {
    try {
      const images: unknown = JSON.parse(listing.images);
      if (Array.isArray(images))
        for (const url of images) if (typeof url === "string") urls.add(url);
    } catch {
      /* malformed legacy image lists are ignored */
    }
  }
  for (const banner of banners)
    for (const url of [banner.imageUrl, banner.mobileImageUrl]) if (url) urls.add(url);
  for (const store of stores)
    for (const url of [store.logoUrl, store.bannerUrl]) if (url) urls.add(url);
  for (const user of users) if (user.avatarUrl) urls.add(user.avatarUrl);
  const done = new Set(existing.map((row) => row.url));
  const root = resolve(process.cwd(), "public");
  const base = process.env.R2_PUBLIC_URL;
  const pending = [...urls].filter((url) => !done.has(url) && publicImageSource(url, root, base));
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      uniqueImages: urls.size,
      pending: pending.length,
      alreadyProcessed: [...urls].filter((url) => done.has(url)).length,
    }),
  );
  if (!apply) return;
  let processed = 0;
  let failed = 0;
  for (const url of pending) {
    try {
      const bytes = await readPublicImage(url, root, base);
      if (!bytes) continue;
      const preview = await createImagePreview(bytes);
      await db.imagePlaceholder.upsert({
        where: { url },
        create: { url, ...preview },
        update: preview,
      });
      processed++;
    } catch {
      failed++;
    }
  }
  console.log(JSON.stringify({ processed, failed }));
  if (failed) process.exitCode = 1;
}
main()
  .catch(() => {
    console.error("Image preview backfill failed");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
