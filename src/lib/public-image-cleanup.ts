import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { deleteImages } from "./uploads";

export async function queuePublicImageCleanup(
  tx: Prisma.TransactionClient,
  urls: (string | null)[],
) {
  const unique = [...new Set(urls.filter((u): u is string => !!u))];
  for (const url of unique)
    await tx.backgroundJob.upsert({
      where: { dedupKey: `public-image-cleanup:${url}` },
      create: {
        kind: "PUBLIC_IMAGE_CLEANUP",
        dedupKey: `public-image-cleanup:${url}`,
        payload: JSON.stringify({ url }),
      },
      update: { status: "PENDING", availableAt: new Date() },
    });
}
export async function deleteUnusedPublicImage(url: string) {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  const key = url.startsWith("/uploads/")
    ? url.slice(9)
    : base && url.startsWith(base + "/")
      ? url.slice(base.length + 1)
      : "";
  if (!/^(stores|avatars)\/[a-f0-9-]{36}\.webp$/.test(key)) return;
  const counts = await Promise.all([
    db.user.count({ where: { avatarUrl: url } }),
    db.store.count({ where: { OR: [{ logoUrl: url }, { bannerUrl: url }] } }),
    db.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT COUNT(*) AS count FROM "Listing" WHERE images::jsonb @> ${JSON.stringify([url])}::jsonb`.then(
      (r) => Number(r[0].count),
    ),
    db.message.count({ where: { imageUrl: url } }),
    db.evidence.count({ where: { fileUrl: url } }),
    db.banner.count({ where: { OR: [{ imageUrl: url }, { mobileImageUrl: url }] } }),
  ]);
  if (!counts.some(Boolean)) await deleteImages([url], true);
}
