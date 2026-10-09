import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("@/lib/push", () => ({ sendPushMany: vi.fn().mockResolvedValue(undefined) }));
import { db } from "@/lib/db";
import { getSponsored } from "@/lib/campaigns";
import { alertSavedSearches } from "@/lib/saved-search";
import { notifyMany } from "@/lib/notify";
import { contentSecurityPolicy } from "@/lib/csp";
import { sitemapRows, sitemapParts } from "@/lib/sitemap-data";
const prefix = `audit-services-${Date.now()}`;
let seller = "",
  category = "";
const ids = Array.from({ length: 50 }, (_, i) => `${prefix}-${String(i).padStart(3, "0")}`);
beforeAll(async () => {
  seller = (
    await db.user.create({
      data: { name: prefix, email: `${prefix}@example.invalid`, passwordHash: "x", city: "الرياض" },
    })
  ).id;
  category = (
    await db.category.create({
      data: { slug: prefix, nameAr: prefix, nameEn: prefix, icon: "Box" },
    })
  ).id;
  await db.listing.createMany({
    data: ids.map((id) => ({
      id,
      sellerId: seller,
      categoryId: category,
      title: id,
      description: "test",
      city: "الرياض",
      isPromoted: true,
    })),
  });
  await db.campaign.createMany({
    data: ids.map((listingId) => ({
      listingId,
      ownerId: seller,
      pointsSpent: 10,
      endsAt: new Date(Date.now() + 3600000),
    })),
  });
});
afterAll(async () => {
  await db.backgroundJob.deleteMany({ where: { payload: { contains: prefix } } });
  await db.listing.deleteMany({ where: { id: { in: ids } } });
  await db.user.delete({ where: { id: seller } });
  await db.category.delete({ where: { id: category } });
  await db.$disconnect();
});
it("PERF-02: campaigns beyond row 40 participate in rotation", async () => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
  try {
    const rows = await getSponsored({ categoryIds: [category], take: 3 });
    expect(rows.some((r) => r.id === ids[49])).toBe(true);
    expect(rows).toHaveLength(3);
  } finally {
    random.mockRestore();
  }
});
it("PERF-02: city filtering happens before sampling", async () => {
  await db.campaign.updateMany({ where: { ownerId: seller }, data: { targetCity: "الرياض" } });
  expect(await getSponsored({ categoryIds: [category], take: 3 })).toHaveLength(0);
  expect(await getSponsored({ categoryIds: [category], take: 3, city: "الرياض" })).toHaveLength(3);
  expect(await getSponsored({ categoryIds: [category], take: 3, city: "جدة" })).toHaveLength(0);
});
it("PERF-01: retried alert delivery creates one inbox notification and one push job", async () => {
  await Promise.all(
    Array.from({ length: 5 }, () =>
      notifyMany([seller], "SYSTEM", prefix, "audit", undefined, prefix),
    ),
  );
  expect(
    await db.notification.count({ where: { userId: seller, eventKey: `${prefix}:${seller}` } }),
  ).toBe(1);
  expect(
    await db.backgroundJob.count({ where: { kind: "PUSH", payload: { contains: prefix } } }),
  ).toBe(1);
});
it("PERF-01: retrying saved-search fanout increments each search only once", async () => {
  const user = await db.user.create({
    data: {
      name: prefix,
      email: `${prefix}-reader@example.invalid`,
      passwordHash: "x",
      city: "الرياض",
    },
  });
  try {
    const search = await db.savedSearch.create({ data: { userId: user.id, category: prefix } });
    await alertSavedSearches(ids[0]);
    await alertSavedSearches(ids[0]);
    expect((await db.savedSearch.findUniqueOrThrow({ where: { id: search.id } })).hits).toBe(1);
    expect(await db.notification.count({ where: { userId: user.id } })).toBe(1);
  } finally {
    await db.backgroundJob.deleteMany({ where: { payload: { contains: user.id } } });
    await db.user.delete({ where: { id: user.id } });
  }
});
it("HARD-01: production scripts require a nonce", () => {
  const policy = contentSecurityPolicy("unique-test-nonce");
  const scripts = policy.split(";").find((s) => s.trim().startsWith("script-src"))!;
  expect(scripts).toContain("'nonce-unique-test-nonce'");
  expect(scripts).not.toContain("unsafe-inline");
  expect(scripts).not.toContain("unsafe-eval");
});
it("SEO-01: sitemap partitions use updated dates and exclude hidden owners", async () => {
  expect(await sitemapParts()).toContain("listings-0");
  const date = new Date("2026-09-16T10:00:00Z");
  await db.listing.update({ where: { id: ids[0] }, data: { updatedAt: date } });
  // Fixtures are deliberately low-volume; the general pager is separately bounded to 1000 rows.
  const rows = await sitemapRows("listings-0");
  const row = rows.find((r) => r.url.endsWith(ids[0]));
  expect(row?.updated).toEqual(date);
  await db.user.update({ where: { id: seller }, data: { isBanned: true } });
  expect((await sitemapRows("listings-0")).some((r) => r.url.endsWith(ids[0]))).toBe(false);
});
