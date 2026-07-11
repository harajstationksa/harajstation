import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, Gavel, Heart, Megaphone, Star } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettingInt, getCampaignDayOptions } from "@/lib/settings";
import { formatSAR, parseImages, timeAgo } from "@/lib/utils";
import { CampaignForm } from "@/components/CampaignForm";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export const metadata = { title: "حملة إعلانية جديدة" };

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string }>;
}) {
  const user = await requireUser();
  const { listing: listingId } = await searchParams;

  if (!listingId) {
    // no listing chosen — rich picker over the user's active listings
    const listings = await db.listing.findMany({
      where: { sellerId: user.id, status: "ACTIVE", isPromoted: false },
      include: {
        category: true,
        _count: { select: { favorites: true } },
        auction: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return (
      <div className="space-y-5">
        <div>
          <h1 className="section-title">اختر إعلاناً للترويج</h1>
          <p className="text-sm text-neutral-500 mt-1">
            حدّد الإعلان الذي تريد تمويله — سيظهر مثبّتاً في أول فئته بإطار «ممول»
          </p>
        </div>
        {listings.length === 0 ? (
          <EmptyState
            title="لا توجد إعلانات قابلة للترويج"
            hint="كل إعلاناتك النشطة إما في حملة بالفعل أو لا توجد إعلانات نشطة"
            action={
              <Link href="/sell" className="btn-primary mt-2">
                أضف إعلاناً جديداً
              </Link>
            }
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {listings.map((l) => {
              const cover = parseImages(l.images)[0];
              return (
                <Link
                  key={l.id}
                  href={`/dashboard/campaigns/new?listing=${l.id}`}
                  className="card group overflow-hidden hover:ring-2 hover:ring-primary-500 hover:shadow-card-hover transition-all"
                >
                  <div className="relative aspect-video overflow-hidden bg-neutral-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cover}
                      alt={l.title}
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                    <span className="tag absolute top-2 right-2 bg-neutral-900/80 text-white backdrop-blur-sm">
                      {l.auction ? <Gavel className="size-3" /> : null}
                      {l.auction ? "مزاد" : l.category.nameAr}
                    </span>
                    {l.isFeatured && (
                      <span className="tag absolute top-2 left-2 bg-neutral-900/80 text-primary-400 backdrop-blur-sm">
                        <Star className="size-3 fill-current" />
                        مميز
                      </span>
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="font-semibold text-sm line-clamp-1">{l.title}</p>
                    <div className="flex items-center justify-between text-xs text-neutral-400">
                      <span className="font-bold text-primary-600 text-sm">
                        {l.price != null ? formatSAR(l.price) : "على السوم"}
                      </span>
                      <span suppressHydrationWarning>{timeAgo(l.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-neutral-100 pt-2">
                      <span className="flex items-center gap-3 text-xs text-neutral-500">
                        <span className="flex items-center gap-1">
                          <Eye className="size-3.5" />
                          {l.views.toLocaleString("en-US")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="size-3.5" />
                          {l._count.favorites}
                        </span>
                      </span>
                      <span className="act-btn bg-primary-50 text-primary-700 group-hover:bg-primary-500 group-hover:text-white transition-colors">
                        <Megaphone className="size-3.5" />
                        روّج هذا الإعلان
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.sellerId !== user.id) redirect("/dashboard/campaigns");
  if (listing.status !== "ACTIVE" || listing.isPromoted) {
    redirect("/dashboard/campaigns");
  }

  // audience data for the estimated-reach panel: real unique visitors of the
  // last 7 days (presence rows) + registered users per city
  const weekAgo = new Date(new Date().getTime() - 7 * 86_400_000);
  const [rate, dayOptions, weeklyVisitors, totalUsers, cityGroups] = await Promise.all([
    getSettingInt("CAMPAIGN_POINTS_PER_DAY", 50),
    getCampaignDayOptions(),
    db.presence.count({ where: { lastSeenAt: { gt: weekAgo } } }),
    db.user.count(),
    db.user.groupBy({ by: ["city"], _count: true }),
  ]);
  const cityCounts = Object.fromEntries(cityGroups.map((g) => [g.city, g._count]));

  return (
    <div className="space-y-5">
      <h1 className="section-title">حملة إعلانية جديدة</h1>
      <CampaignForm
        listing={{ id: listing.id, title: listing.title, city: listing.city }}
        ratePerDay={rate}
        dayOptions={dayOptions}
        balance={user.points}
        dailyVisitors={Math.round(weeklyVisitors / 7)}
        totalUsers={totalUsers}
        cityCounts={cityCounts}
      />
    </div>
  );
}
