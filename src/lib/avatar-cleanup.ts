import { db } from "./db";
import { deleteImages } from "./uploads";

/** Delete only our immutable avatar files and only after all references are gone. */
export async function deleteUnusedAvatar(url: string) {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  const key = url.startsWith("/uploads/")
    ? url.slice(9)
    : base && url.startsWith(base + "/")
      ? url.slice(base.length + 1)
      : "";
  if (!/^avatars\/[a-f0-9-]{36}\.webp$/.test(key)) return;
  const counts = await Promise.all([
    db.user.count({ where: { avatarUrl: url } }),
    db.store.count({ where: { OR: [{ logoUrl: url }, { bannerUrl: url }] } }),
    db.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT COUNT(*) AS count FROM "Listing" WHERE images::jsonb @> ${JSON.stringify([url])}::jsonb`.then(
      (rows) => Number(rows[0].count),
    ),
    db.message.count({ where: { imageUrl: url } }),
    db.banner.count({
      where: { OR: [{ imageUrl: url }, { mobileImageUrl: url }] },
    }),
    db.evidence.count({ where: { fileUrl: url } }),
  ]);
  if (counts.some(Boolean)) return;
  await deleteImages([url], true);
}
