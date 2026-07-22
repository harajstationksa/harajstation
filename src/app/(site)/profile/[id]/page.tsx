import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, MapPin, Star, Store as StoreIcon } from "lucide-react";
import { db } from "@/lib/db";
import { BRAND, pageMeta } from "@/lib/seo";
import { getCurrentUser } from "@/lib/auth";
import { cardInclude } from "@/lib/types";
import { getT } from "@/lib/i18n";
import { formatDate, trustLevel } from "@/lib/utils";
import { AuctionCard } from "@/components/AuctionCard";
import { Avatar } from "@/components/Avatar";
import { ChatButton } from "@/components/ChatButton";
import { EmptyState } from "@/components/EmptyState";
import { FollowButton } from "@/components/FollowButton";
import { ListingCard } from "@/components/ListingCard";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    select: { name: true, city: true, _count: { select: { listings: true } } },
  });
  if (!user) return {};

  return pageMeta({
    title: `${user.name} — إعلانات البائع`,
    description:
      `تصفح ${user._count.listings} إعلاناً من ${user.name}` +
      `${user.city ? ` في ${user.city}` : ""} على ${BRAND}، مع تقييمات المشترين السابقين.`,
    path: `/profile/${id}`,
  });
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    include: {
      listings: {
        where: { status: "ACTIVE" },
        include: cardInclude,
        orderBy: { bumpedAt: "desc" },
      },
      stores: { orderBy: { createdAt: "asc" } },
      reviewsGotten: {
        include: { author: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
  if (!user || user.isBanned) notFound();

  const { lang, t } = await getT();
  const p = t.profile;
  const viewer = await getCurrentUser();
  const [followerCount, myFollow] = await Promise.all([
    db.follow.count({ where: { sellerId: user.id } }),
    viewer
      ? db.follow.findUnique({
          where: { followerId_sellerId: { followerId: viewer.id, sellerId: user.id } },
        })
      : null,
  ]);

  const level = trustLevel(user.credibility);
  const reviews = user.reviewsGotten;
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : null;

  return (
    <div className="container-page py-8 pb-12 space-y-6">
      <div className="card p-6 flex flex-col sm:flex-row items-center gap-5">
        <Avatar name={user.name} color={user.avatarColor} src={user.avatarUrl} pro={user.isPro} className="size-20 text-3xl" />
        <div className="flex-1 text-center sm:text-right space-y-2">
          <h1 className="font-display font-bold text-2xl flex items-center gap-2 justify-center sm:justify-start">
            {user.name}
            {user.idVerified && (
              <span className="badge bg-green-50 text-green-700 text-xs" title={p.verifiedTip}>
                <BadgeCheck className="size-3.5" />
                {p.verified}
              </span>
            )}
          </h1>
          <p className="text-sm text-neutral-500 flex items-center gap-3 justify-center sm:justify-start flex-wrap">
            <span className="flex items-center gap-1">
              <MapPin className="size-4" />
              {user.city}
            </span>
            <span>{p.memberSince} {formatDate(user.createdAt, lang)}</span>
            <span className="flex items-center gap-1">
              <BadgeCheck className="size-4 text-success" />
              {user.successfulTx} {p.deals}
            </span>
            {avgRating != null && (
              <span className="flex items-center gap-1 text-amber-500 font-semibold">
                <Star className="size-4 fill-current" />
                {avgRating.toFixed(1)} ({reviews.length} {p.reviews})
              </span>
            )}
          </p>
          {user.stores.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1 justify-center sm:justify-start">
              {user.stores.map((s) => (
                <Link
                  key={s.id}
                  href={`/store/${s.slug}`}
                  className="badge bg-neutral-900 text-white hover:bg-neutral-800"
                >
                  <StoreIcon className="size-3.5" />
                  {s.name}
                </Link>
              ))}
            </div>
          )}
          {(!viewer || viewer.id !== user.id) && (
            <div className="flex items-center gap-2 justify-center sm:justify-start pt-1 flex-wrap">
              <FollowButton
                sellerId={user.id}
                initialFollowing={!!myFollow}
                followerCount={followerCount}
              />
              <ChatButton userId={user.id} label={p.chat} />
            </div>
          )}
        </div>

        <div className="w-full sm:w-64 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-500">{p.credScore}</span>
            <span className="font-display font-extrabold text-lg" style={{ color: level.color }}>
              {user.credibility}/100
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-neutral-100 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${user.credibility}%`, backgroundColor: level.color }}
            />
          </div>
          <p className="text-xs font-bold text-center" style={{ color: level.color }}>
            {level.label}
          </p>
        </div>
      </div>

      {reviews.length > 0 && (
        <section className="card p-5 space-y-3">
          <h2 className="font-bold flex items-center gap-2">
            <Star className="size-5 text-amber-500 fill-current" />
            {p.reviewsTitle} ({reviews.length})
          </h2>
          <ul className="divide-y divide-neutral-50">
            {reviews.map((r) => (
              <li key={r.id} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-xs text-neutral-500">{r.author.name}</p>
                  {r.comment && <p className="text-neutral-700 mt-0.5">{r.comment}</p>}
                </div>
                <span className="flex items-center gap-0.5 shrink-0" dir="ltr">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`size-3.5 ${i < r.rating ? "text-amber-500 fill-current" : "text-neutral-200"}`}
                    />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="section-title mb-4">
          {p.listingsOf(user.name)} ({user.listings.length})
        </h2>
        {user.listings.length === 0 ? (
          <EmptyState title={p.noListings} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {user.listings.map((listing) =>
              listing.type === "AUCTION" ? (
                <AuctionCard key={listing.id} listing={listing} />
              ) : (
                <ListingCard key={listing.id} listing={listing} />
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}
