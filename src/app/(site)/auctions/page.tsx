import Link from "next/link";
import { Clock, Flame, Gavel, MapPin, Search, SlidersHorizontal, TrendingUp, X, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { cardInclude } from "@/lib/types";
import { getT } from "@/lib/i18n";
import { finalizeExpiredAuctions } from "@/lib/auction";
import { getSponsored, recordImpressions } from "@/lib/campaigns";
import { str, type SP } from "@/lib/listing-query";
import { normalizeArabic } from "@/lib/arabic";
import { expandQuery } from "@/lib/search-smart";
import { CITIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { AuctionCard } from "@/components/AuctionCard";
import { CategoryIcon } from "@/components/CategoryIcon";
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

  const [live, ended, catRows, endingSoonCount, liveBidCount] = await Promise.all([
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
    db.auction.count({
      where: { status: "LIVE", endsAt: { gt: now, lt: new Date(now.getTime() + 3600_000) } },
    }),
    db.bid.count({
      where: { auction: { status: "LIVE", endsAt: { gt: now } } },
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
  const sponsoredPool = await getSponsored({ categoryIds: chipCatIds, city, take: 9 });
  const sponsored = sponsoredPool.filter((l) => l.type === "AUCTION").slice(0, 3);
  await recordImpressions(sponsored.map((l) => l.campaigns[0]?.id ?? ""));
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

  return (
    <div className="pb-8">
      {/* ── hero ── */}
      <section className="bg-neutral-900 text-white">
        <div className="container-page py-10 sm:py-12">
          <div className="max-w-2xl mx-auto text-center space-y-3">
            <span className="badge bg-red-600 text-white mx-auto">
              <span className="size-1.5 rounded-full bg-white animate-live-pulse" />
              {live.length} {t.auctionsPage.liveNow}
            </span>
            <h1 className="font-display font-extrabold text-3xl sm:text-4xl">
              {t.auctionsPage.title}
            </h1>
            <p className="text-neutral-400 text-sm sm:text-base">
              {t.auctionsPage.subtitle}
            </p>
          </div>

          {/* quick stats strip */}
          <div className="mt-8 grid grid-cols-4 max-w-2xl mx-auto divide-x divide-x-reverse divide-white/10 rounded-2xl bg-white/5 border border-white/10">
            {[
              { icon: Gavel, value: live.length, label: t.auctionsPage.statLive },
              { icon: Clock, value: endingSoonCount, label: t.auctionsPage.statEndingSoon },
              { icon: TrendingUp, value: liveBidCount, label: t.auctionsPage.statBids },
              { icon: Flame, value: ended.length, label: t.auctionsPage.statEnded },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="py-4 text-center">
                <Icon className="size-4 mx-auto text-primary-400" />
                <p className="font-display font-extrabold text-xl mt-1">{value.toLocaleString("en-US")}</p>
                <p className="text-[11px] text-neutral-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="container-page mt-6 space-y-8">
        {/* ── filters ── */}
        <div className="space-y-3">
          {/* category chips */}
          {chips.length > 0 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              <Link
                href={filterLink({ category: undefined })}
                className={cn(
                  "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors",
                  !catSlug
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
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
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
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

          {/* filter panel */}
          <div className="card overflow-hidden">
            {/* quick-status tabs */}
            <div className="flex border-b border-neutral-100">
              {quickTabs.map(({ key, label, icon: Icon }) => (
                <Link
                  key={label}
                  href={filterLink({ quick: key })}
                  className={cn(
                    "flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors",
                    quick === key
                      ? "border-primary-500 text-primary-600 bg-primary-50/50"
                      : "border-transparent text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              ))}
            </div>

            <form method="GET" action="/auctions" className="p-3 flex flex-wrap items-center gap-2">
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

            {(q || catSlug || city) && (
              <div className="px-3 pb-3">
                <SaveSearchButton
                  query={q ?? ""}
                  category={catSlug ?? ""}
                  city={city ?? ""}
                  type="AUCTION"
                />
              </div>
            )}
          </div>
        </div>

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
