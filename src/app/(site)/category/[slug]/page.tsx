import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { cardInclude } from "@/lib/types";
import { getT } from "@/lib/i18n";
import {
  recordImpressions,
  shuffle,
  sponsoredInclude,
} from "@/lib/campaigns";
import { listingOrderBy, str, type SP } from "@/lib/listing-query";
import { cache, Suspense } from "react";
import { AuctionCard } from "@/components/AuctionCard";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EmptyState } from "@/components/EmptyState";
import { FiltersBar } from "@/components/FiltersBar";
import { ListingCard } from "@/components/ListingCard";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { SponsoredCard } from "@/components/SponsoredCard";
import { CardGridSkeleton } from "@/components/Skeletons";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

/**
 * The ads for this category. Shared by the count and the grid via cache(), so
 * the two streamed sections run the queries once between them.
 */
const loadAds = cache(async (slug: string, sp: SP) => {
  const min = Number(str(sp.min)) || undefined;
  const max = Number(str(sp.max)) || undefined;
  const page = Math.max(1, Number(str(sp.page)) || 1);

  const where = {
    status: "ACTIVE",
    ...(str(sp.city) ? { city: str(sp.city) } : {}),
    ...(str(sp.condition) ? { condition: str(sp.condition) } : {}),
    ...(str(sp.type) ? { type: str(sp.type) } : {}),
    ...(min || max ? { price: { gte: min, lte: max } } : {}),
    category: { OR: [{ slug }, { parent: { slug } }] },
  };

  // sponsored (campaign-funded) listings in this category: always pinned at the
  // top with the sponsored frame, in a fresh random rotation on every refresh
  // so no funded ad is favored over another
  const [sponsored, items, total] = await Promise.all([
    db.listing.findMany({
      where: { ...where, isPromoted: true },
      include: sponsoredInclude,
    }),
    db.listing.findMany({
      where,
      include: cardInclude,
      orderBy: listingOrderBy(str(sp.sort)),
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    db.listing.count({ where }),
  ]);

  // sponsored pins show on the first page only — deeper pages are pure results
  const pinned = page === 1 ? shuffle(sponsored) : [];
  const pinnedIds = new Set(pinned.map((l) => l.id));
  const rest = items.filter((l) => !pinnedIds.has(l.id));

  // ad analytics: one impression per unique visitor network — reloads don't count
  await recordImpressions(pinned.map((l) => l.campaigns[0]?.id ?? ""));

  return { pinned, rest, total, page };
});

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { lang, t } = await getT();
  const { slug } = await params;
  const sp = await searchParams;

  const category = await db.category.findUnique({
    where: { slug: decodeURIComponent(slug) },
    include: {
      parent: true,
      children: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!category) notFound();

  return (
    <div className="container-page py-6 pb-12 space-y-5">
      <nav className="flex items-center gap-1 text-sm text-neutral-500">
        <Link href="/" className="hover:text-primary-600">{t.categoryPage.home}</Link>
        <ChevronLeft className="size-3.5 ltr:rotate-180" />
        <Link href="/categories" className="hover:text-primary-600">{t.categoryPage.categories}</Link>
        {category.parent && (
          <>
            <ChevronLeft className="size-3.5 ltr:rotate-180" />
            <Link href={`/category/${category.parent.slug}`} className="hover:text-primary-600">
              {lang === "en" ? category.parent.nameEn : category.parent.nameAr}
            </Link>
          </>
        )}
        <ChevronLeft className="size-3.5 ltr:rotate-180" />
        <span className="text-neutral-800">
          {lang === "en" ? category.nameEn : category.nameAr}
        </span>
      </nav>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="size-12 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center">
          <CategoryIcon name={category.icon} className="size-6" />
        </span>
        <div>
          <h1 className="section-title">
            {lang === "en" ? category.nameEn : category.nameAr}
          </h1>
          <Suspense
            fallback={<div className="h-5 w-24 mt-1 rounded-md bg-neutral-200/80 animate-pulse" />}
          >
            <AdCount slug={category.slug} sp={sp} />
          </Suspense>
        </div>
        {/* alert for anything new in this category (+ the active filters) */}
        <div className="ms-auto">
          <SaveSearchButton
            category={category.slug}
            city={str(sp.city) ?? ""}
            type={str(sp.type) ?? ""}
          />
        </div>
      </div>

      {category.children.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {category.children.map((child) => (
            <Link
              key={child.id}
              href={`/category/${child.slug}`}
              className="rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-sm font-medium text-neutral-600 hover:border-primary-400 hover:text-primary-600 transition-colors shrink-0"
            >
              {lang === "en" ? child.nameEn : child.nameAr}
            </Link>
          ))}
        </div>
      )}

      <Suspense>
        <FiltersBar basePath={`/category/${category.slug}`} />
      </Suspense>

      <Suspense fallback={<CardGridSkeleton count={12} />}>
        <Ads slug={category.slug} sp={sp} />
      </Suspense>
    </div>
  );
}

async function AdCount({ slug, sp }: { slug: string; sp: SP }) {
  const { t } = await getT();
  const { total } = await loadAds(slug, sp);
  return (
    <p className="text-sm text-neutral-500">
      {total} {t.categoryPage.activeAds}
    </p>
  );
}

async function Ads({ slug, sp }: { slug: string; sp: SP }) {
  const { t } = await getT();
  const { pinned, rest, total, page } = await loadAds(slug, sp);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageLink = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === "string" && v && k !== "page") params.set(k, v);
    }
    if (p > 1) params.set("page", String(p));
    return `/category/${slug}${params.size ? `?${params}` : ""}`;
  };

  if (pinned.length === 0 && rest.length === 0) {
    return (
      <EmptyState
        title={t.categoryPage.emptyTitle}
        hint={t.categoryPage.emptyHint}
        action={
          <Link href="/sell" className="btn-primary mt-2">
            {t.categoryPage.addYourAd}
          </Link>
        }
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {pinned.map((listing) => (
          <SponsoredCard
            key={listing.id}
            listing={listing}
            campaignId={listing.campaigns[0]?.id}
          />
        ))}
        {rest.map((listing) =>
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
