import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, MapPin, Star, Store } from "lucide-react";
import { db } from "@/lib/db";
import { BRAND, pageMeta } from "@/lib/seo";
import { getCurrentUser } from "@/lib/auth";
import { cardInclude } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { AuctionCard } from "@/components/AuctionCard";
import { Avatar } from "@/components/Avatar";
import { CredibilityBadge } from "@/components/CredibilityBadge";
import { EmptyState } from "@/components/EmptyState";
import { FollowButton } from "@/components/FollowButton";
import { ListingCard } from "@/components/ListingCard";
import { ReportButton } from "@/components/ReportButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await db.store.findUnique({
    where: { slug },
    select: {
      name: true,
      description: true,
      logoUrl: true,
      bannerUrl: true,
      _count: { select: { listings: true } },
    },
  });
  if (!store) return {};

  return pageMeta({
    title: `${store.name} — متجر`,
    description:
      store.description?.slice(0, 160) ||
      `تصفح ${store._count.listings} إعلاناً من متجر ${store.name} على ${BRAND} — بيع ومزادات من بائع موثوق.`,
    path: `/store/${slug}`,
    // the banner is the wide image; the logo is a square and crops badly in a card
    images: [store.bannerUrl ?? store.logoUrl].filter((v): v is string => !!v),
  });
}

export default async function PublicStorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await db.store.findUnique({
    where: { slug },
    include: {
      user: { include: { reviewsGotten: { select: { rating: true } } } },
      listings: {
        where: { status: "ACTIVE" },
        include: cardInclude,
        orderBy: [{ isPromoted: "desc" }, { isFeatured: "desc" }, { createdAt: "desc" }],
      },
    },
  });
  if (!store || store.user.isBanned) notFound();

  const owner = store.user;
  const viewer = await getCurrentUser();
  const [followerCount, myFollow] = await Promise.all([
    db.follow.count({ where: { sellerId: owner.id } }),
    viewer
      ? db.follow.findUnique({
          where: { followerId_sellerId: { followerId: viewer.id, sellerId: owner.id } },
        })
      : null,
  ]);
  const listings = store.listings;
  const ratings = owner.reviewsGotten;
  const avgRating =
    ratings.length > 0
      ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length
      : null;

  return (
    <div className="pb-12">
      {/* custom banner image (owner-uploaded) */}
      {store.bannerUrl && (
        <div className="relative h-40 sm:h-56 bg-neutral-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={store.bannerUrl} alt="" className="size-full object-cover" />
        </div>
      )}

      {/* store header */}
      <div className="bg-gradient-to-l from-neutral-900 to-neutral-800 text-white">
        <div className="container-page py-10 flex flex-col sm:flex-row items-center gap-5">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.logoUrl}
              alt={store.name}
              className="size-20 rounded-2xl object-cover border-2 border-white/20 shrink-0"
            />
          ) : (
            <span className="size-20 rounded-2xl bg-primary-500 flex items-center justify-center shrink-0">
              <Store className="size-10" />
            </span>
          )}
          <div className="flex-1 text-center sm:text-right space-y-2">
            <h1 className="font-display font-extrabold text-3xl flex items-center gap-2 justify-center sm:justify-start">
              {store.name}
              {owner.isPro && <span className="badge bg-white/10 text-primary-400">PRO</span>}
            </h1>
            {store.description && (
              <p className="text-neutral-300 text-sm max-w-xl">{store.description}</p>
            )}
            <div className="flex items-center gap-3 justify-center sm:justify-start flex-wrap text-sm text-neutral-400">
              <span className="flex items-center gap-1">
                <MapPin className="size-4" />
                {owner.city}
              </span>
              <span>منذ {formatDate(store.createdAt)}</span>
              {avgRating != null && (
                <span className="flex items-center gap-1 text-amber-400 font-semibold">
                  <Star className="size-4 fill-current" />
                  {avgRating.toFixed(1)} ({ratings.length} تقييم)
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Link
              href={`/profile/${owner.id}`}
              className="flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-4 py-2 transition-colors"
            >
              <Avatar name={owner.name} color={owner.avatarColor} src={owner.avatarUrl} className="size-7 text-xs" />
              <span className="text-sm">{owner.name}</span>
            </Link>
            <div className="flex items-center gap-2">
              <CredibilityBadge score={owner.credibility} compact />
              <span className="text-xs text-neutral-400 flex items-center gap-1">
                <BadgeCheck className="size-3.5" />
                {owner.successfulTx} معاملة
              </span>
              <ReportButton targetType="USER" targetId={owner.id} compact />
            </div>
            {(!viewer || viewer.id !== owner.id) && (
              <FollowButton
                sellerId={owner.id}
                initialFollowing={!!myFollow}
                followerCount={followerCount}
                className="!min-h-9 !px-4 text-xs"
              />
            )}
          </div>
        </div>
      </div>

      <div className="container-page mt-8">
        <h2 className="section-title mb-4">
          منتجات المتجر ({listings.length})
        </h2>
        {listings.length === 0 ? (
          <EmptyState title="لا توجد منتجات معروضة حالياً" hint="لم يُسنِد صاحب المتجر أي إعلان لهذا المتجر بعد" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {listings.map((listing) =>
              listing.type === "AUCTION" ? (
                <AuctionCard key={listing.id} listing={listing} />
              ) : (
                <ListingCard key={listing.id} listing={listing} />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
