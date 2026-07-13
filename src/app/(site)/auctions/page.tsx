import Link from "next/link";
import { Flame, Gavel, MapPin, Plus, Search, SlidersHorizontal, X, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { cardInclude } from "@/lib/types";
import { getT } from "@/lib/i18n";
import { finalizeExpiredAuctions } from "@/lib/auction";
import { getSponsored, recordImpressions } from "@/lib/campaigns";
import { str, type SP } from "@/lib/listing-query";
import { normalizeArabic } from "@/lib/arabic";
import { expandQuery } from "@/lib/search-smart";
import { CITIES } from "@/lib/constants";
import { cn, parseImages } from "@/lib/utils";
import { AuctionCard } from "@/components/AuctionCard";
import { CategoryIcon } from "@/components/CategoryIcon";
import { SpotlightCarousel, type SpotlightItem } from "@/components/SpotlightCarousel";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/SectionHeader";
import { SponsoredCard } from "@/components/SponsoredCard";

export const dynamic = "force-dynamic";

export const metadata = { title: "المزادات المباشرة" };

export default async function AuctionsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { lang, t } = await getT();
  await finalizeExpiredAuctions();
  const now = new Date();
  const sp = await searchParams;
  const q = str(sp.q);
  const catSlug = str(sp.category);
  const city = str(sp.city);
  const sort = str(sp.sort) ?? "ending";
  const quick = str(sp.quick); // undefined | "soon" | "buynow"
  const hasFilters = !!(q || catSlug || city || quick || sort !== "ending");

  // smart search inside auctions — same synonym expansion as the main search
  const groups = q ? expandQuery(q) : [];
  const searchWhere =
    groups.length > 0
      ? {
          AND: groups.map((group) => ({
            OR: group.flatMap((term) => [
              { searchText: { contains: term } },
              { title: { contains: term } },
            ]),
          })),
        }
      : q
        ? { searchText: { contains: normalizeArabic(q) } }
        : {};

  const liveWhere = {
    type: "AUCTION",
    status: "ACTIVE",
    auction: {
      status: "LIVE",
      endsAt: quick === "soon"
        ? { gt: now, lt: new Date(now.getTime() + 3600_000) }
        : { gt: now },
      ...(quick === "buynow" ? { buyNowPrice: { not: null } } : {}),
    },
    ...searchWhere,
    ...(city ? { city } : {}),
    ...(catSlug
      ? { category: { OR: [{ slug: catSlug }, { parent: { slug: catSlug } }] } }
      : {}),
  };

  const [live, ended, catRows, soonest] = await Promise.all([
    db.listing.findMany({
      where: liveWhere,
      include: cardInclude,
      orderBy:
        sort === "newest"
          ? { createdAt: "desc" as const }
          : { auction: { endsAt: "asc" as const } },
    }),
    db.listing.findMany({
      where: { type: "AUCTION", auction: { status: { in: ["ENDED", "NO_SALE"] } } },
      include: cardInclude,
      orderBy: { auction: { endsAt: "desc" } },
      take: 4,
    }),
    // main categories that actually have live auctions → filter chips
    db.listing.findMany({
      where: { type: "AUCTION", status: "ACTIVE", auction: { status: "LIVE", endsAt: { gt: now } } },
      select: { category: { select: { id: true, slug: true, nameAr: true, nameEn: true, icon: true, parent: { select: { id: true, slug: true, nameAr: true, nameEn: true, icon: true } } } } },
    }),
    // hero fallback — the live auctions closest to their hammer, regardless of
    // filters (used only when no sponsored auctions exist)
    db.listing.findMany({
      where: { type: "AUCTION", status: "ACTIVE", auction: { status: "LIVE", endsAt: { gt: now } } },
      include: cardInclude,
      orderBy: { auction: { endsAt: "asc" } },
      take: 3,
    }),
  ]);

  // JS sorts that need the aggregated bid data (small result sets)
  const currentBid = (l: (typeof live)[number]) =>
    l.auction?.bids[0]?.amount ?? l.auction?.startPrice ?? 0;
  if (sort === "bids") {
    live.sort((a, b) => (b.auction?._count.bids ?? 0) - (a.auction?._count.bids ?? 0));
  } else if (sort === "price_desc") {
    live.sort((a, b) => currentBid(b) - currentBid(a));
  } else if (sort === "price_asc") {
    live.sort((a, b) => currentBid(a) - currentBid(b));
  }

  // roll subcategories up to their main category for the chip row
  const chipMap = new Map<string, { slug: string; nameAr: string; nameEn: string; icon: string; count: number }>();
  for (const row of catRows) {
    const root = row.category.parent ?? row.category;
    const entry = chipMap.get(root.id) ?? { slug: root.slug, nameAr: root.nameAr, nameEn: root.nameEn, icon: root.icon, count: 0 };
    entry.count++;
    chipMap.set(root.id, entry);
  }
  const chips = [...chipMap.values()].sort((a, b) => b.count - a.count);

  // sponsored placements — this surface is auctions-only: standard sale ads
  // never appear here, only funded AUCTION listings
  const chipCatIds = catSlug
    ? (
        await db.category.findMany({
          where: { OR: [{ slug: catSlug }, { parent: { slug: catSlug } }] },
          select: { id: true },
        })
      ).map((c) => c.id)
    : undefined;
  const sponsoredPool = await getSponsored({ categoryIds: chipCatIds, city, take: 12 });
  const sponsoredAuctions = sponsoredPool.filter((l) => l.type === "AUCTION");
  const sponsored = sponsoredAuctions.slice(0, 3);
  // hero carousel: up to 5 funded auctions — getSponsored reshuffles per
  // request, so the mix (and its order) changes on every reload
  const heroSponsored = sponsoredAuctions.slice(0, 5);
  await recordImpressions(heroSponsored.map((l) => l.campaigns[0]?.id ?? ""));
  const sponsoredIds = new Set(sponsored.map((s) => s.id));
  const liveRest = live.filter((l) => !sponsoredIds.has(l.id));

  const filterLink = (params: Record<string, string | undefined>) => {
    const merged = {
      q,
      category: catSlug,
      city,
      quick,
      sort: sort === "ending" ? undefined : sort,
      ...params,
    };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
    return `/auctions${qs.size ? `?${qs}` : ""}`;
  };

  const quickTabs = [
    { key: undefined, label: t.auctionsPage.quickAll, icon: Gavel },
    { key: "soon", label: t.auctionsPage.quickEndingSoon, icon: Flame },
    { key: "buynow", label: t.auctionsPage.quickBuyNow, icon: Zap },
  ] as const;

  // hero carousel pool: sponsored auctions first; without any, the auctions
  // ending soonest keep the stage alive
  const toSpot = (l: (typeof soonest)[number], campaignId?: string): SpotlightItem => ({
    auctionId: l.auction!.id,
    title: l.title,
    cover: parseImages(l.images)[0] ?? "/images/ph/chair1.svg",
    bid: l.auction!.bids[0]?.amount ?? l.auction!.startPrice,
    bidCount: l.auction!._count.bids,
    endsAt: l.auction!.endsAt.toISOString(),
    campaignId,
  });
  const spotlightItems =
    heroSponsored.length > 0
      ? heroSponsored.filter((l) => l.auction).map((l) => toSpot(l, l.campaigns[0]?.id))
      : soonest.filter((l) => l.auction).map((l) => toSpot(l));

  return (
    <div className="pb-8">
      {/* ── hero: dark stage with warm glows + ending-soonest spotlight ── */}
      <section className="relative overflow-hidden bg-neutral-950 text-white">
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -end-24 size-96 rounded-full bg-primary-500/25 blur-3xl" />
          <div className="absolute -bottom-40 start-1/3 size-[28rem] rounded-full bg-primary-600/15 blur-3xl" />
          <div className="absolute top-1/4 -start-24 size-72 rounded-full bg-sand-400/10 blur-3xl" />
        </div>

        <div className="container-page relative pt-10 pb-14 sm:pt-14 sm:pb-16">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-14 items-center">
            {/* copy + CTAs */}
            <div className="space-y-5 text-center lg:text-start">
              <span className="badge bg-red-600 text-white lg:me-auto max-lg:mx-auto w-fit">
                <span className="size-1.5 rounded-full bg-white animate-live-pulse" />
                {live.length} {t.auctionsPage.liveNow}
              </span>
              <h1 className="font-display font-extrabold text-4xl sm:text-5xl leading-[1.15]">
                {t.auctionsPage.title}
              </h1>
              <p className="text-neutral-400 text-sm sm:text-base leading-relaxed max-w-md max-lg:mx-auto">
                {t.auctionsPage.subtitle}
              </p>
              <div className="flex items-center gap-3 justify-center lg:justify-start pt-1">
                <Link href="/sell" className="btn-primary">
                  <Plus className="size-4" />
                  {t.auctionsPage.heroCta}
                </Link>
                <a
                  href="#auctions"
                  className="btn bg-white/10 text-white border border-white/15 hover:bg-white/20"
                >
                  <Gavel className="size-4" />
                  {t.auctionsPage.heroBrowse}
                </a>
              </div>
            </div>

            {/* spotlight carousel: rotates through the sponsored live auctions */}
            <SpotlightCarousel items={spotlightItems} />
          </div>
        </div>
      </section>

      {/* ── floating filter toolbar (overlaps the hero edge) ── */}
      <div className="container-page relative z-10 -mt-7" id="auctions">
        <div className="card rounded-2xl shadow-card-hover p-3 sm:p-4 space-y-3">
          {/* segmented quick-status control */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-xl bg-neutral-100 p-1 max-sm:w-full">
              {quickTabs.map(({ key, label, icon: Icon }) => (
                <Link
                  key={label}
                  href={filterLink({ quick: key })}
                  className={cn(
                    "flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 sm:px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors",
                    quick === key
                      ? "bg-neutral-900 text-white shadow-sm"
                      : "text-neutral-500 hover:text-neutral-900"
                  )}
                >
                  <Icon className="size-4 shrink-0 max-sm:hidden" />
                  <span className="truncate">{label}</span>
                </Link>
              ))}
            </div>
            {(q || catSlug || city) && (
              <div className="ms-auto">
                <SaveSearchButton
                  query={q ?? ""}
                  category={catSlug ?? ""}
                  city={city ?? ""}
                  type="AUCTION"
                />
              </div>
            )}
          </div>

          <form method="GET" action="/auctions" className="flex flex-wrap items-center gap-2">
            {catSlug && <input type="hidden" name="category" value={catSlug} />}
            {quick && <input type="hidden" name="quick" value={quick} />}
            <div className="relative flex-[2] min-w-44">
              <Search className="size-4 text-neutral-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
              <input
                type="search"
                name="q"
                defaultValue={q ?? ""}
                placeholder={t.auctionsPage.searchPlaceholder}
                className="input ps-9"
              />
            </div>
            <div className="relative flex-1 min-w-36 sm:max-w-44">
              <MapPin className="size-4 text-neutral-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
              <select name="city" defaultValue={city ?? ""} className="input ps-9" aria-label={t.filters.allCities}>
                <option value="">{t.filters.allCities}</option>
                {CITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="relative flex-1 min-w-36 sm:max-w-44">
              <SlidersHorizontal className="size-4 text-neutral-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
              <select name="sort" defaultValue={sort} className="input ps-9" aria-label="sort">
                <option value="ending">{t.auctionsPage.sortEnding}</option>
                <option value="newest">{t.filters.sortNew}</option>
                <option value="bids">{t.auctionsPage.sortBids}</option>
                <option value="price_desc">{t.auctionsPage.sortPriceHigh}</option>
                <option value="price_asc">{t.auctionsPage.sortPriceLow}</option>
              </select>
            </div>
            <button type="submit" className="btn-primary max-sm:flex-1">{t.filters.apply}</button>
            {hasFilters && (
              <Link href="/auctions" className="btn-ghost !min-h-11 text-neutral-500">
                <X className="size-4" />
                {t.auctionsPage.clearFilters}
              </Link>
            )}
          </form>
        </div>
      </div>

      <div className="container-page mt-6 space-y-8">
        {/* category chips */}
        {chips.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <Link
              href={filterLink({ category: undefined })}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors",
                !catSlug
                  ? "bg-primary-500 text-white border-primary-500"
                  : "bg-white text-neutral-600 border-neutral-200 hover:border-primary-300 hover:text-primary-600"
              )}
            >
              {t.nav.all}
            </Link>
            {chips.map((c) => (
              <Link
                key={c.slug}
                href={filterLink({ category: c.slug })}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors",
                  catSlug === c.slug
                    ? "bg-primary-500 text-white border-primary-500"
                    : "bg-white text-neutral-600 border-neutral-200 hover:border-primary-300 hover:text-primary-600"
                )}
              >
                <CategoryIcon name={c.icon} className="size-4" />
                {lang === "en" ? c.nameEn : c.nameAr}
                <span className={cn("text-[11px]", catSlug === c.slug ? "text-white/70" : "text-neutral-400")}>
                  {c.count}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* ── sponsored auction placements (auctions only — never standard ads) ── */}
        {sponsored.length > 0 && (
          <section>
            <SectionHeader
              title={t.home.promoted}
              badge={<span className="badge bg-amber-500 text-white">{t.home.sponsored}</span>}
            />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {sponsored.map((listing) => (
                <SponsoredCard
                  key={listing.id}
                  listing={listing}
                  campaignId={listing.campaigns[0]?.id}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── live auctions ── */}
        <section>
          <SectionHeader
            title={t.auctionsPage.liveSection}
            badge={
              <span className="chip tabular-nums">
                {live.length.toLocaleString("en-US")} {t.auctionsPage.resultsCount}
              </span>
            }
          />
          {liveRest.length === 0 && sponsored.length === 0 ? (
            <EmptyState
              title={t.auctionsPage.emptyTitle}
              hint={t.auctionsPage.emptyHint}
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {liveRest.map((listing) => (
                <AuctionCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </section>

        {/* ── recently ended ── */}
        {ended.length > 0 && (
          <section>
            <SectionHeader title={t.auctionsPage.endedRecently} />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 opacity-80">
              {ended.map((listing) => (
                <AuctionCard key={listing.id} listing={listing} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
