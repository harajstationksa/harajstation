import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Search } from "lucide-react";
import { db } from "@/lib/db";
import { cardInclude } from "@/lib/types";
import { getT } from "@/lib/i18n";
import { getSponsored, recordImpressions } from "@/lib/campaigns";
import { getSetting } from "@/lib/settings";
import { cached } from "@/lib/page-cache";
import { AuctionCard } from "@/components/AuctionCard";
import { BannerCarousel } from "@/components/BannerCarousel";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ListingCard } from "@/components/ListingCard";
import { SectionHeader } from "@/components/SectionHeader";
import { SponsoredCard } from "@/components/SponsoredCard";
import {
  CardGridSkeleton,
  CardRowSkeleton,
  CategoriesSkeleton,
  SectionSkeleton,
  StatsSkeleton,
} from "@/components/Skeletons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // the homepage is the one page whose canonical is the bare domain
  alternates: { canonical: "/" },
};

/**
 * The page itself touches no data, so the shell — headings, layout, the whole
 * chrome — reaches the browser immediately. Each section below fetches what it
 * needs on its own and streams in when ready, behind a placeholder of the same
 * shape. They render as siblings, so their queries run concurrently rather than
 * one page-wide await blocking the first byte.
 */
export default async function HomePage() {
  const { t } = await getT();

  return (
    <div className="pb-8">
      <div className="container-page pt-4 sm:pt-6">
        <Suspense fallback={null}>
          <HeroBanner />
        </Suspense>
      </div>

      <div className="container-page space-y-12 sm:space-y-16 mt-10">
        <section id="categories">
          <SectionHeader title={t.home.browseCategories} href="/categories" />
          <Suspense fallback={<CategoriesSkeleton />}>
            <Categories />
          </Suspense>
        </section>

        <section>
          <SectionHeader
            title={t.home.liveNow}
            subtitle={t.home.liveSub}
            badge={
              <span className="badge bg-red-600 text-white">
                <span className="size-1.5 rounded-full bg-white animate-live-pulse" />
                {t.home.live}
              </span>
            }
            href="/auctions"
          />
          <Suspense fallback={<CardRowSkeleton />}>
            <LiveAuctions />
          </Suspense>
        </section>

        <Suspense fallback={<SectionSkeleton />}>
          <Promoted />
        </Suspense>

        <section>
          <SectionHeader title={t.home.featured} href="/listings?featured=1" />
          <Suspense fallback={<CardGridSkeleton />}>
            <Featured />
          </Suspense>
        </section>

        <Suspense fallback={<SectionSkeleton count={8} />}>
          <CategorySections />
        </Suspense>

        <Suspense fallback={null}>
          <MiddleBanner />
        </Suspense>

        <section>
          <SectionHeader title={t.home.latest} href="/listings" />
          <Suspense fallback={<CardGridSkeleton count={8} />}>
            <Latest />
          </Suspense>
          <div className="text-center mt-8">
            <Link href="/listings" className="btn-secondary">
              <Search className="size-4" />
              {t.home.browseAll}
            </Link>
          </div>
        </section>

        <Suspense fallback={<StatsSkeleton />}>
          <Stats />
        </Suspense>
      </div>
    </div>
  );
}

/*
 * Every section below reads through the in-process cache (src/lib/page-cache):
 * the homepage is the same for all visitors (language only changes which name
 * field is displayed), so under load each query runs once per TTL instead of
 * once per visitor. Measured before caching: ~13 queries x 27ms to a remote
 * database per view capped the whole site at ~4 pages/second.
 */

async function HeroBanner() {
  const banners = await cached("home:banner:top", 60_000, () =>
    db.banner.findMany({ where: { status: "ACTIVE", position: "HOME_TOP" } })
  );
  if (banners.length === 0) return null;
  return <BannerCarousel banners={banners} hero />;
}

async function MiddleBanner() {
  const banners = await cached("home:banner:middle", 60_000, () =>
    db.banner.findMany({ where: { status: "ACTIVE", position: "HOME_MIDDLE" } })
  );
  if (banners.length === 0) return null;
  return <BannerCarousel banners={banners} />;
}

async function Categories() {
  const { lang } = await getT();
  const categories = await cached("home:categories", 300_000, () =>
    db.category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: "asc" },
    })
  );

  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-11 gap-2 sm:gap-3">
      {categories.map((cat) => (
        <Link
          key={cat.id}
          href={`/category/${cat.slug}`}
          className="group flex flex-col items-center gap-2.5 py-2 px-1 text-center"
        >
          {/* the icon sits on a soft tile instead of floating in bold black —
              the row reads as a quiet index, and colour is saved for hover */}
          <span className="flex size-12 sm:size-14 items-center justify-center rounded-2xl bg-neutral-50 ring-1 ring-neutral-100 transition-colors duration-200 group-hover:bg-primary-50 group-hover:ring-primary-100">
            <CategoryIcon
              name={cat.icon}
              className="size-5.5 sm:size-6 text-neutral-500 transition-colors duration-200 group-hover:text-primary-600"
              strokeWidth={1.5}
            />
          </span>
          <span className="text-[11px] sm:text-xs font-medium text-neutral-600 leading-tight transition-colors duration-200 group-hover:text-neutral-900">
            {lang === "en" ? cat.nameEn : cat.nameAr}
          </span>
        </Link>
      ))}
    </div>
  );
}

async function LiveAuctions() {
  const { t } = await getT();
  // 30s TTL — tighter than the rest so a just-ended auction disappears fast
  const auctions = await cached("home:live-auctions", 30_000, () =>
    db.listing.findMany({
      where: {
        type: "AUCTION",
        status: "ACTIVE",
        auction: { status: "LIVE", endsAt: { gt: new Date() } },
      },
      include: cardInclude,
      orderBy: { auction: { endsAt: "asc" } },
      take: 8,
    })
  );

  if (auctions.length === 0) {
    return <p className="text-neutral-500 text-sm">{t.home.noLive}</p>;
  }
  return (
    <div className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 snap-x">
      {auctions.map((listing) => (
        <AuctionCard
          key={listing.id}
          listing={listing}
          className="w-56 sm:w-64 shrink-0 snap-start"
        />
      ))}
    </div>
  );
}

async function Promoted() {
  const { t } = await getT();
  const promoted = await cached("home:promoted", 60_000, () =>
    db.listing.findMany({
      where: { status: "ACTIVE", isPromoted: true },
      include: cardInclude,
      orderBy: { createdAt: "desc" },
      take: 8,
    })
  );
  if (promoted.length === 0) return null;

  return (
    <section>
      <SectionHeader
        title={t.home.promoted}
        badge={<span className="badge bg-amber-500 text-white">{t.home.sponsored}</span>}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {promoted.map((listing) =>
          listing.type === "AUCTION" ? (
            <AuctionCard key={listing.id} listing={listing} />
          ) : (
            <ListingCard key={listing.id} listing={listing} />
          )
        )}
      </div>
    </section>
  );
}

async function Featured() {
  const featured = await cached("home:featured", 60_000, () =>
    db.listing.findMany({
      where: { status: "ACTIVE", isFeatured: true },
      include: cardInclude,
      orderBy: { createdAt: "desc" },
      take: 8,
    })
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {featured.map((listing) =>
        listing.type === "AUCTION" ? (
          <AuctionCard key={listing.id} listing={listing} />
        ) : (
          <ListingCard key={listing.id} listing={listing} />
        )
      )}
    </div>
  );
}

async function Latest() {
  const latest = await cached("home:latest", 60_000, () =>
    db.listing.findMany({
      where: { status: "ACTIVE", type: { not: "AUCTION" } },
      include: cardInclude,
      orderBy: { createdAt: "desc" },
      take: 12,
    })
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {latest.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}

/**
 * One section per main category that actually has ads: sponsored listings pinned
 * first in a fresh random rotation per request, then the latest ads fill the row.
 */
async function CategorySections() {
  const { lang } = await getT();
  // Cached as one unit — the sponsored rotation now reshuffles once per TTL
  // instead of per request, which is still fair play between funded ads.
  const sections = await cached("home:category-sections", 60_000, async () => {
    const [categories, grouped] = await Promise.all([
      db.category.findMany({
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
        include: { children: { select: { id: true } } },
      }),
      db.listing.groupBy({
        by: ["categoryId"],
        where: { status: "ACTIVE" },
        _count: true,
      }),
    ]);

    const countByCat = Object.fromEntries(grouped.map((g) => [g.categoryId, g._count]));
    const withAds = categories.filter(
      (cat) =>
        (countByCat[cat.id] ?? 0) +
          cat.children.reduce((sum, ch) => sum + (countByCat[ch.id] ?? 0), 0) >
        0
    );

    return Promise.all(
      withAds.map(async (cat) => {
        const catIds = [cat.id, ...cat.children.map((c) => c.id)];
        const [pinned, regular] = await Promise.all([
          getSponsored({ categoryIds: catIds, take: 4 }),
          db.listing.findMany({
            where: { status: "ACTIVE", isPromoted: false, categoryId: { in: catIds } },
            include: cardInclude,
            orderBy: { createdAt: "desc" },
            take: 8,
          }),
        ]);
        return { cat, pinned, regular: regular.slice(0, 8 - pinned.length) };
      })
    );
  });

  // ad analytics: one impression per unique visitor network — reloads don't
  // count. Fire-and-forget: reads request headers, so it must stay outside the
  // cached closure, and it must never hold up the render.
  void recordImpressions(
    sections.flatMap((s) => s.pinned).map((l) => l.campaigns[0]?.id ?? "")
  );

  return (
    <>
      {sections.map(({ cat, pinned, regular }) => (
        <section key={cat.id}>
          <SectionHeader
            title={lang === "en" ? cat.nameEn : cat.nameAr}
            href={`/category/${cat.slug}`}
            accent={false}
          />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {pinned.map((listing) => (
              <SponsoredCard
                key={listing.id}
                listing={listing}
                campaignId={listing.campaigns[0]?.id}
              />
            ))}
            {regular.map((listing) =>
              listing.type === "AUCTION" ? (
                <AuctionCard key={listing.id} listing={listing} />
              ) : (
                <ListingCard key={listing.id} listing={listing} />
              )
            )}
          </div>
        </section>
      ))}
    </>
  );
}

async function Stats() {
  // admin kill-switch, toggled from /admin/banners
  if ((await getSetting("HOME_STATS_VISIBLE")) !== "1") return null;

  const { t } = await getT();
  const [activeListings, liveCount, userCount] = await cached(
    "home:stats",
    300_000,
    () =>
      Promise.all([
        db.listing.count({ where: { status: "ACTIVE" } }),
        db.auction.count({ where: { status: "LIVE", endsAt: { gt: new Date() } } }),
        db.user.count(),
      ])
  );

  return (
    <section className="rounded-2xl bg-neutral-900 text-white px-6 py-8 flex items-center justify-around text-center">
      {[
        [activeListings.toLocaleString("en-US"), t.home.statListings],
        [liveCount.toLocaleString("en-US"), t.home.statAuctions],
        [userCount.toLocaleString("en-US"), t.home.statUsers],
      ].map(([value, label]) => (
        <div key={label}>
          <p className="font-display font-extrabold text-2xl sm:text-3xl">{value}+</p>
          <p className="text-neutral-400 text-xs sm:text-sm mt-1">{label}</p>
        </div>
      ))}
    </section>
  );
}
