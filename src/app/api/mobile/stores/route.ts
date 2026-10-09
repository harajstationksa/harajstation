import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Public store directory. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();

  const stores = await db.store.findMany({
    where: {
      user: { isBanned: false },
      ...(q ? { name: { contains: q.slice(0, 200), mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ isVerified: "desc" }, { createdAt: "desc" }],
    take: 60,
    include: {
      _count: {
        select: {
          listings: { where: { status: "ACTIVE" } },
          followers: true,
        },
      },
    },
  });

  return NextResponse.json({
    items: stores.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      logoUrl: s.logoUrl,
      bannerUrl: s.bannerUrl,
      isVerified: s.isVerified,
      activeListings: s._count.listings,
      followers: s._count.followers,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}
