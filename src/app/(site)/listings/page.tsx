import type { Metadata } from "next";
import Link from "next/link";
import { cache, Suspense } from "react";
import { BadgeCheck, LayoutGrid, Search, Store, Users } from "lucide-react";
import { db } from "@/lib/db";
import { cardInclude } from "@/lib/types";
import { getT } from "@/lib/i18n";
import {
  buildListingWhere,
  listingOrderBy,
  scoreListing,
  str,
  type SP,
} from "@/lib/listing-query";
import { matchCategorySlugs, suggestCorrection } from "@/lib/search-smart";
import { getSponsored, recordImpressions } from "@/lib/campaigns";
import { canonicalFor, isFiltered, pageMeta } from "@/lib/seo";
import { AuctionCard } from "@/components/AuctionCard";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EmptyState } from "@/components/EmptyState";
import { FiltersBar } from "@/components/FiltersBar";
import { ListingCard } from "@/components/ListingCard";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { SponsoredCard } from "@/components/SponsoredCard";
import { CardGridSkeleton } from "@/components/Skeletons";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SP>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const q = str(sp.q);
  return pageMeta({
    title: q ? `نتائج البحث عن «${q}»` : "تصفح جميع الإعلانات",
    description:
      "آلاف الإعلانات والمزادات في السعودية — سيارات، عقارات، إلكترونيات، أثاث وأكثر. " +
      "ابحث بالمدينة والسعر والحالة، وتواصل مع البائع مباشرة.",
    path: canonicalFor("/listings", sp),
    // a search or a filtered slice is not a page of its own — it points home
    noindex: isFiltered(sp),
  });
}

const PAGE_SIZE = 24;

/**
 * All the data this page needs, in one pass.
 *
 * Wrapped in React's cache() so the three streamed sections below — the result
 * count, the suggested categories and the grid — share a single execution
 * instead of each re-running the queries (and re-recording ad impressions).
 */
const loadResults = cache(async (sp: SP) => {
  const page = Math.max(1, Number(str(sp.page)) || 1);
  const where = buildListingWhere(sp);
  const q = str(sp.q);
  const sort = str(sp.sort);

  let items;
  let total;
  if (q && !sort) {
    // relevance ranking: relevance → featured → recency
    const candidates = await db.listing.findMany({
      where,
      include: cardInclude,
      take: 200,
    });
    candidates.sort((a, b) => scoreListing(b, q) - scoreListing(a, q));
    total = candidates.length;
    items = candidates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else {
    [items, total] = await Promise.all([
      db.listing.findMany({
        where,
        include: cardInclude,
        orderBy: listingOrderBy(sort),
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      db.listing.count({ where }),
    ]);
  }

  // ── query understanding: which categories does this search imply? ──
  // "ايفون" → هواتف ذكية: offered as a browse destination + used to focus ads
  const impliedSlugs = q ? matchCategorySlugs(q).slice(0, 3) : [];
  const norm = q ? q.trim() : "";
  const suggestedCats = q
    ? await db.category.findMany({
        where: {
          OR: [
            { slug: { in: impliedSlugs } },
            { nameAr: { contains: norm } },
            { nameEn: { contains: norm } },
          ],
        },
        take: 4,
      })
    : [];

  // ── matching stores: a search for a shop by name should find the shop ──
  const stores =
    q && page === 1
      ? await db.store.findMany({
          where: {
            user: { isBanned: false },
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q.toLowerCase() } },
            ],
          },
          select: {
            id: true,
            slug: true,
            name: true,
            logoUrl: true,
            isVerified: true,
            _count: { select: { followers: true, listings: { where: { status: "ACTIVE" } } } },
          },
          orderBy: [{ isVerified: "desc" }, { createdAt: "asc" }],
          take: 3,
        })
      : [];

  // ── matching sellers: searching a person's name should find their profile ──
  const sellers =
    q && page === 1
      ? await db.user.findMany({
          where: { isBanned: false, name: { contains: q, mode: "insensitive" } },
          select: {
            id: true,
            name: true,
            avatarColor: true,
            avatarUrl: true,
            idVerified: true,
          },
          orderBy: [{ idVerified: "desc" }, { credibility: "desc" }],
          take: 3,
        })
      : [];

  // sponsored ads inside search results, targeted to the search's categories —
  // a phone campaign surfaces for phone searches, never for unrelated ones
  let sponsored: Awaited<ReturnType<typeof getSponsored>> = [];
  if (q && page === 1) {
    const targetCatIds = new Set<string>(suggestedCats.map((c) => c.id));
    items.slice(0, 12).forEach((l) => targetCatIds.add(l.categoryId));
    if (targetCatIds.size > 0) {
      sponsored = await getSponsored({ categoryIds: [...targetCatIds], take: 2 });
      const sponsoredIds = new Set(sponsored.map((s) => s.id));
      items = items.filter((l) => !sponsoredIds.has(l.id));
      await recordImpressions(sponsored.map((l) => l.campaigns[0]?.id ?? ""));
    }
  }

  // zero results? try to guess the typo ("ايفوون" → "ايفون")
  const correction =
    q && total === 0 && sponsored.length === 0 ? suggestCorrection(q) : null;

  return { items, total, sponsored, suggestedCats, stores, sellers, correction, page };
});

/**
 * The shell — heading, filters, layout — renders straight away from the URL
 * alone. Everything that needs the database streams in underneath it.
 */
export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { t } = await getT();
  const sp = await searchParams;
  const q = str(sp.q);

  return (
    <div className="container-page py-6 pb-12 space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="section-title">
            {q ? `${t.listingsPage.resultsFor} «${q}»` : t.listingsPage.title}
          </h1>
          <Suspense
            fallback={<div className="h-5 w-24 mt-1.5 rounded-md bg-neutral-200/80 animate-pulse" />}
          >
            <ResultCount sp={sp} />
          </Suspense>
        </div>
        {(q || str(sp.category) || str(sp.city) || str(sp.type)) && (
          <SaveSearchButton
            query={q ?? ""}
            category={str(sp.category) ?? ""}
            city={str(sp.city) ?? ""}
            type={str(sp.type) ?? ""}
          />
        )}
      </div>

      <Suspense fallback={null}>
        <SuggestedCategories sp={sp} />
      </Suspense>

      <Suspense fallback={null}>
        <MatchingStores sp={sp} />
      </Suspense>

      <Suspense fallback={null}>
        <MatchingSellers sp={sp} />
      </Suspense>

      <Suspense>
        <FiltersBar />
      </Suspense>

      <Suspense fallback={<CardGridSkeleton count={12} />}>
        <Results sp={sp} />
      </Suspense>
    </div>
  );
}

async function ResultCount({ sp }: { sp: SP }) {
  const { t } = await getT();
  const { total } = await loadResults(sp);
  return (
    <p className="text-sm text-neutral-500 mt-1">
      {total} {t.listingsPage.adsCount}
    </p>
  );
}

/** smart search: the query implies these categories — offer them */
async function SuggestedCategories({ sp }: { sp: SP }) {
  const { t } = await getT();
  const { suggestedCats } = await loadResults(sp);
  if (suggestedCats.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
        <LayoutGrid className="size-3.5" />
        {t.listingsPage.browseInCategory}
      </span>
      {suggestedCats.map((c) => (
        <Link
          key={c.id}
          href={`/category/${c.slug}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3.5 py-1.5 text-sm font-semibold text-primary-800 hover:bg-primary-100 transition-colors"
        >
          <CategoryIcon name={c.icon} className="size-4" />
          {c.nameAr}
        </Link>
      ))}
    </div>
  );
}

/** the search matched sellers by name — surface their profiles */
async function MatchingSellers({ sp }: { sp: SP }) {
  const { sellers } = await loadResults(sp);
  if (sellers.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
        <Users className="size-3.5" />
        بائعون مطابقون
      </span>
      {sellers.map((u) => (
        <Link
          key={u.id}
          href={`/profile/${u.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-800 hover:border-primary-300 hover:bg-primary-50 transition-colors"
        >
          {u.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.avatarUrl} alt="" className="size-6 rounded-full object-cover" />
          ) : (
            <span
              className="size-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
              style={{ backgroundColor: u.avatarColor }}
            >
              {u.name.charAt(0)}
            </span>
          )}
          {u.name}
          {u.idVerified && <BadgeCheck className="size-4 text-green-600" />}
        </Link>
      ))}
    </div>
  );
}

/** the search matched stores by name — surface them above the listings */
async function MatchingStores({ sp }: { sp: SP }) {
  const { stores } = await loadResults(sp);
  if (stores.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
        <Store className="size-3.5" />
        متاجر مطابقة
      </span>
      {stores.map((s) => (
        <Link
          key={s.id}
          href={`/store/${s.slug}`}
          className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-800 hover:border-primary-300 hover:bg-primary-50 transition-colors"
        >
          {s.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logoUrl} alt="" className="size-6 rounded-full object-cover" />
          ) : (
            <span className="size-6 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center">
              <Store className="size-3.5" />
            </span>
          )}
          {s.name}
          {s.isVerified && <BadgeCheck className="size-4 text-green-600" />}
          <span className="text-xs text-neutral-400 font-normal flex items-center gap-0.5">
            <Users className="size-3" />
            {s._count.followers.toLocaleString("en-US")}
          </span>
        </Link>
      ))}
    </div>
  );
}

async function Results({ sp }: { sp: SP }) {
  const { t } = await getT();
  const { items, total, sponsored, correction, page } = await loadResults(sp);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageLink = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === "string" && v && k !== "page") params.set(k, v);
    }
    if (p > 1) params.set("page", String(p));
    return `/listings${params.size ? `?${params}` : ""}`;
  };

  if (sponsored.length === 0 && items.length === 0) {
    const correctedLink = () => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(sp)) {
        if (typeof v === "string" && v && k !== "page" && k !== "q") params.set(k, v);
      }
      params.set("q", correction!);
      return `/listings?${params}`;
    };
    return (
      <div className="space-y-4">
        {correction && (
          <div className="flex items-center gap-2 text-sm bg-primary-50 border border-primary-100 rounded-xl px-4 py-3">
            <Search className="size-4 text-primary-500 shrink-0" />
            <span className="text-neutral-600">هل تقصد</span>
            <Link href={correctedLink()} className="font-bold text-primary-700 hover:underline">
              «{correction}»
            </Link>
            <span className="text-neutral-600">؟</span>
          </div>
        )}
        <EmptyState title={t.listingsPage.emptyTitle} hint={t.listingsPage.emptyHint} />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {sponsored.map((listing) => (
          <SponsoredCard
            key={listing.id}
            listing={listing}
            campaignId={listing.campaigns[0]?.id}
          />
        ))}
        {items.map((listing) =>
          listing.type === "AUCTION" ? (
            <AuctionCard key={listing.id} listing={listing} />
          ) : (
            <ListingCard key={listing.id} listing={listing} />
          )
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          {page > 1 && (
            <Link href={pageLink(page - 1)} className="btn-secondary">
              {t.listingsPage.prev}
            </Link>
          )}
          <span className="text-sm text-neutral-500">
            {t.listingsPage.pageOf(page, totalPages)}
          </span>
          {page < totalPages && (
            <Link href={pageLink(page + 1)} className="btn-secondary">
              {t.listingsPage.next}
            </Link>
          )}
        </div>
      )}
    </>
  );
}
