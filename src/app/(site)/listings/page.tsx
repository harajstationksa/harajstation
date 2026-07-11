import Link from "next/link";
import { Suspense } from "react";
import { LayoutGrid } from "lucide-react";
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
import { matchCategorySlugs } from "@/lib/search-smart";
import { getSponsored, recordImpressions } from "@/lib/campaigns";
import { AuctionCard } from "@/components/AuctionCard";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EmptyState } from "@/components/EmptyState";
import { FiltersBar } from "@/components/FiltersBar";
import { ListingCard } from "@/components/ListingCard";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { SponsoredCard } from "@/components/SponsoredCard";

export const dynamic = "force-dynamic";

export const metadata = { title: "تصفح الإعلانات" };

const PAGE_SIZE = 24;

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { t } = await getT();
  const sp = await searchParams;
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageLink = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === "string" && v && k !== "page") params.set(k, v);
    }
    if (p > 1) params.set("page", String(p));
    return `/listings${params.size ? `?${params}` : ""}`;
  };

  return (
    <div className="container-page py-6 pb-12 space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="section-title">
            {q ? `${t.listingsPage.resultsFor} «${q}»` : t.listingsPage.title}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {total} {t.listingsPage.adsCount}
          </p>
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

      {/* smart search: the query implies these categories — offer them */}
      {suggestedCats.length > 0 && (
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
      )}

      <Suspense>
        <FiltersBar />
      </Suspense>

      {sponsored.length === 0 && items.length === 0 ? (
        <EmptyState
          title={t.listingsPage.emptyTitle}
          hint={t.listingsPage.emptyHint}
        />
      ) : (
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
      )}

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
    </div>
  );
}
