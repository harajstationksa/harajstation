import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  banners: vi.fn(),
  listings: vi.fn(),
  categories: vi.fn(),
  grouped: vi.fn(),
  listingCount: vi.fn(),
  auctionCount: vi.fn(),
  userCount: vi.fn(),
  sponsored: vi.fn(),
  setting: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    banner: { findMany: mocks.banners },
    listing: { findMany: mocks.listings, groupBy: mocks.grouped, count: mocks.listingCount },
    category: { findMany: mocks.categories },
    auction: { count: mocks.auctionCount },
    user: { count: mocks.userCount },
  },
}));
vi.mock("@/lib/campaigns", () => ({ getSponsored: mocks.sponsored }));
vi.mock("@/lib/settings", () => ({ getSetting: mocks.setting }));
vi.mock("@/app/api/mobile/_lib/serialize", () => ({
  listingCardInclude: {},
  serializeListingCard: (ad: { id: string }) => ({ id: ad.id }),
}));
import { GET } from "@/app/api/mobile/home/route";
import { bannerOrder, visibleBannerWhere } from "@/lib/visible-banners";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.banners.mockResolvedValue([]);
  mocks.listings.mockResolvedValue([]);
  mocks.categories.mockResolvedValue([]);
  mocks.grouped.mockResolvedValue([]);
  mocks.sponsored.mockResolvedValue([]);
  mocks.setting.mockResolvedValue("0");
});

describe("mobile home shares website content", () => {
  it("uses shared scheduled banners, phone images and safe embeds without caching", async () => {
    mocks.banners.mockResolvedValue([
      {
        id: "banner",
        imageUrl: "/wide.webp",
        mobileImageUrl: "/phone.webp",
        position: "HOME_TOP",
        embedHtml: '<iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe>',
      },
    ]);
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    const json = await response.json();
    expect(json.banners[0]).toMatchObject({
      imageUrl: "/wide.webp",
      mobileImageUrl: "/phone.webp",
      embedUrl: "https://www.youtube-nocookie.com/embed/abc",
    });
    expect(json.banners[0]).not.toHaveProperty("embedHtml");
    expect(mocks.banners.mock.calls[0][0].orderBy).toEqual(bannerOrder);
    expect(mocks.banners.mock.calls[0][0].where.status).toBe("ACTIVE");
  });

  it("never publishes arbitrary banner HTML as executable content", async () => {
    mocks.banners.mockResolvedValue([
      { id: "bad", embedHtml: '<iframe src="https://evil.example"></iframe>' },
    ]);
    const json = await (await GET()).json();
    expect(json.banners[0].embedUrl).toBeNull();
    expect(json.banners[0]).not.toHaveProperty("embedHtml");
  });

  it("includes ads in child categories and preserves sponsored rotation", async () => {
    mocks.categories.mockResolvedValue([
      { id: "parent", slug: "cars", nameAr: "سيارات", children: [{ id: "child" }] },
    ]);
    mocks.grouped.mockResolvedValue([{ categoryId: "child", _count: 2 }]);
    mocks.sponsored.mockResolvedValue([{ id: "second" }, { id: "first" }]);
    mocks.listings.mockImplementation(async (args) =>
      args.where.id
        ? [{ id: "first" }, { id: "second" }]
        : args.where.categoryId
          ? [{ id: "regular" }]
          : [],
    );
    const json = await (await GET()).json();
    expect(json.categorySections).toEqual([
      {
        slug: "cars",
        nameAr: "سيارات",
        items: [{ id: "second" }, { id: "first" }, { id: "regular" }],
      },
    ]);
    expect(mocks.sponsored).toHaveBeenCalledWith({ categoryIds: ["parent", "child"], take: 4 });
    expect(
      mocks.listings.mock.calls.some(([args]) => args.where.categoryId?.in.includes("child")),
    ).toBe(true);
  });

  it("excludes auction ads from latest and expired featured ads from featured", async () => {
    await GET();
    expect(mocks.listings.mock.calls.some(([args]) => args.where.type?.not === "AUCTION")).toBe(
      true,
    );
    expect(
      mocks.listings.mock.calls.some(
        ([args]) => args.where.isFeatured && args.where.OR[1].featuredUntil.gt instanceof Date,
      ),
    ).toBe(true);
  });

  it("honors the admin's stats switch", async () => {
    const hidden = await (await GET()).json();
    expect(hidden.stats).toBeNull();
    expect(mocks.userCount).not.toHaveBeenCalled();
    mocks.setting.mockResolvedValue("1");
    mocks.listingCount.mockResolvedValue(12);
    mocks.auctionCount.mockResolvedValue(2);
    mocks.userCount.mockResolvedValue(8);
    const visible = await (await GET()).json();
    expect(visible.stats).toEqual({ activeListings: 12, liveAuctions: 2, users: 8 });
  });

  it("website and app apply the same inclusive date window", () => {
    const now = new Date("2026-10-04T08:00:00Z");
    expect(visibleBannerWhere(now, "HOME_TOP")).toEqual({
      status: "ACTIVE",
      position: "HOME_TOP",
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    });
  });
});
