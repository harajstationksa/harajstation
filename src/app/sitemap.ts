import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, auctions, categories, stores] = await Promise.all([
    db.listing.findMany({
      // everything that isn't an auction lives at /listings/:id — announcements
      // included, or they'd never be indexed
      where: { status: "ACTIVE", type: { not: "AUCTION" } },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    db.auction.findMany({
      where: { listing: { status: "ACTIVE" } },
      select: { id: true, endsAt: true, listing: { select: { createdAt: true } } },
      orderBy: { endsAt: "desc" },
      take: 2000,
    }),
    db.category.findMany({ select: { slug: true } }),
    db.store.findMany({ select: { slug: true, createdAt: true }, take: 2000 }),
  ]);

  // the pages that describe the business — thin on their own, but they are what
  // a search for "هل حراج ستيشن موثوق" is looking for
  const statics: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/listings`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/auctions`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/categories`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/trust`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/pro`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE}/contact`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  return [
    ...statics,
    ...categories.map((c) => ({
      url: `${SITE}/category/${encodeURIComponent(c.slug)}`,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...listings.map((l) => ({
      url: `${SITE}/listings/${l.id}`,
      lastModified: l.createdAt,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...auctions.map((a) => ({
      url: `${SITE}/auctions/${a.id}`,
      lastModified: a.listing.createdAt,
      changeFrequency: "hourly" as const,
      priority: 0.7,
    })),
    ...stores.map((s) => ({
      url: `${SITE}/store/${encodeURIComponent(s.slug)}`,
      lastModified: s.createdAt,
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
  ];
}
