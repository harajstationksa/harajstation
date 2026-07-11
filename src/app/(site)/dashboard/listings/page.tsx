import Link from "next/link";
import {
  BadgeCheck,
  Eye,
  Gavel,
  Heart,
  ListChecks,
  Megaphone,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LISTING_STATUS } from "@/lib/constants";
import { getSettingInt } from "@/lib/settings";
import { cn, formatSAR, parseImages, timeAgo } from "@/lib/utils";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { EmptyState } from "@/components/EmptyState";
import {
  deleteListingAction,
  featureWithPointsAction,
  markSoldAction,
  relistAction,
} from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "إعلاناتي" };

const STATUS_CLS: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700",
  PENDING: "bg-amber-50 text-amber-700",
  SOLD: "bg-blue-50 text-blue-700",
  EXPIRED: "bg-neutral-100 text-neutral-500",
  REMOVED: "bg-red-50 text-red-600",
};

const STATUS_FILTERS = [
  ["", "الكل"],
  ["ACTIVE", "نشطة"],
  ["SOLD", "مباعة"],
  ["EXPIRED", "منتهية"],
] as const;

const TYPE_FILTERS = [
  ["", "بيع ومزاد"],
  ["STANDARD", "بيع"],
  ["AUCTION", "مزاد"],
] as const;

export default async function MyListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = sp.status ?? "";
  const type = sp.type ?? "";
  const featureCost = await getSettingInt("FEATURE_POINT_COST", 100);

  const [listings, all] = await Promise.all([
    db.listing.findMany({
      where: {
        sellerId: user.id,
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
      },
      include: {
        auction: { include: { _count: { select: { bids: true } }, bids: { orderBy: { amount: "desc" }, take: 1 } } },
        _count: { select: { favorites: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // unfiltered aggregates for the summary strip
    db.listing.findMany({
      where: { sellerId: user.id },
      select: { status: true, type: true, views: true },
    }),
  ]);

  const summary = [
    {
      icon: ListChecks,
      label: "إعلانات نشطة",
      value: all.filter((l) => l.status === "ACTIVE" && l.type === "STANDARD").length,
    },
    {
      icon: Gavel,
      label: "مزادات نشطة",
      value: all.filter((l) => l.status === "ACTIVE" && l.type === "AUCTION").length,
    },
    {
      icon: BadgeCheck,
      label: "مباعة",
      value: all.filter((l) => l.status === "SOLD").length,
    },
    {
      icon: Eye,
      label: "إجمالي المشاهدات",
      value: all.reduce((s, l) => s + l.views, 0),
    },
  ];

  const filterLink = (next: { status?: string; type?: string }) => {
    const merged = { status, type, ...next };
    const qs = new URLSearchParams();
    if (merged.status) qs.set("status", merged.status);
    if (merged.type) qs.set("type", merged.type);
    return `/dashboard/listings${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="section-title">إعلاناتي ومزاداتي</h1>
        <Link href="/sell" className="btn-primary">
          <Plus className="size-4" />
          أضف إعلان
        </Link>
      </div>

      {/* ── summary strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summary.map(({ icon: Icon, label, value }) => (
          <div key={label} className="card px-4 py-3">
            <p className="text-[11px] text-neutral-400 flex items-center gap-1.5">
              <Icon className="size-3.5" />
              {label}
            </p>
            <p className="font-display font-extrabold text-xl tabular-nums mt-0.5">
              {value.toLocaleString("en-US")}
            </p>
          </div>
        ))}
      </div>

      {/* ── filters ── */}
      <div className="card p-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-neutral-400 me-1">الحالة:</span>
          {STATUS_FILTERS.map(([v, label]) => (
            <Link
              key={v}
              href={filterLink({ status: v })}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors",
                status === v
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-neutral-400 me-1">النوع:</span>
          {TYPE_FILTERS.map(([v, label]) => (
            <Link
              key={v}
              href={filterLink({ type: v })}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors",
                type === v
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
        <span className="text-xs text-neutral-400 ms-auto tabular-nums">
          {listings.length.toLocaleString("en-US")} إعلان
        </span>
      </div>

      {listings.length === 0 ? (
        <EmptyState
          title={status || type ? "لا توجد إعلانات مطابقة للفلتر" : "لم تنشر أي إعلان بعد"}
          hint={
            status || type
              ? "جرّب فلتراً آخر أو اعرض الكل"
              : "ابدأ ببيع ما لا تحتاجه — أو أطلق مزاداً واترك السوق يحدد السعر"
          }
          action={
            status || type ? (
              <Link href="/dashboard/listings" className="btn-secondary mt-2">عرض الكل</Link>
            ) : (
              <Link href="/sell" className="btn-primary mt-2">أضف إعلانك الأول</Link>
            )
          }
        />
      ) : (
        <div className="card overflow-hidden divide-y divide-neutral-100">
          {listings.map((l) => {
            const cover = parseImages(l.images)[0];
            const href = l.auction ? `/auctions/${l.auction.id}` : `/listings/${l.id}`;
            const isAuction = l.type === "AUCTION";
            const liveAuction = isAuction && l.auction?.status === "LIVE";
            const price = isAuction
              ? (l.auction?.bids[0]?.amount ?? l.auction?.startPrice ?? 0)
              : (l.price ?? 0);
            const canFeature = l.status === "ACTIVE" && !l.isFeatured && user.points >= featureCost;
            const canEdit = l.status === "ACTIVE" && !liveAuction;
            const canPromote = l.status === "ACTIVE" && !l.isPromoted;
            const canSell = l.status === "ACTIVE" && !liveAuction;
            const canRelist = l.status === "SOLD" || l.status === "EXPIRED";

            return (
              <div key={l.id} className="p-3 hover:bg-neutral-50/60 transition-colors">
                <div className="flex items-center gap-3">
                  <Link href={href} className="flex items-center gap-3 min-w-0 flex-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cover} alt="" className="size-16 rounded-lg object-cover border border-neutral-100 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm line-clamp-1">{l.title}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`badge ${isAuction ? "bg-red-50 text-red-600" : "bg-primary-50 text-primary-700"}`}>
                          {isAuction ? <Gavel className="size-3" /> : <Tag className="size-3" />}
                          {isAuction ? "مزاد" : "بيع عادي"}
                        </span>
                        <span className={`badge ${STATUS_CLS[l.status] ?? "bg-neutral-100"}`}>
                          {LISTING_STATUS[l.status as keyof typeof LISTING_STATUS] ?? l.status}
                        </span>
                        {l.isFeatured && <span className="badge bg-primary-500 text-white">مميز</span>}
                        {l.isPromoted && <span className="badge bg-amber-500 text-white">ممول</span>}
                      </div>
                    </div>
                  </Link>
                  <div className="text-left shrink-0">
                    <p className="font-bold text-primary-600 tabular-nums">{formatSAR(price)}</p>
                    <p className="text-xs text-neutral-400 flex items-center gap-1 justify-end mt-0.5">
                      <Eye className="size-3.5" />
                      {l.views.toLocaleString("en-US")}
                      <Heart className="size-3.5 ms-1" />
                      {l._count.favorites}
                      <span className="mx-1">·</span>
                      <span suppressHydrationWarning>{timeAgo(l.createdAt)}</span>
                    </p>
                  </div>
                </div>

                {/* management actions */}
                <div className="flex items-center gap-1.5 flex-wrap mt-2.5 ps-19">
                  {canEdit && (
                    <Link href={`/dashboard/listings/${l.id}/edit`} className="act-btn bg-neutral-100 text-neutral-700 hover:bg-neutral-200">
                      <Pencil className="size-3.5" />
                      تعديل
                    </Link>
                  )}
                  {canPromote && (
                    <Link href={`/dashboard/campaigns/new?listing=${l.id}`} className="act-btn bg-primary-50 text-primary-700 hover:bg-primary-100">
                      <Megaphone className="size-3.5" />
                      حملة إعلانية
                    </Link>
                  )}
                  {canFeature && (
                    <form action={featureWithPointsAction}>
                      <input type="hidden" name="listingId" value={l.id} />
                      <ConfirmSubmit className="act-btn bg-amber-100 text-amber-800 hover:bg-amber-200">
                        <Sparkles className="size-3.5" />
                        تمييز بـ{featureCost} نقطة
                      </ConfirmSubmit>
                    </form>
                  )}
                  {canSell && (
                    <form action={markSoldAction}>
                      <input type="hidden" name="listingId" value={l.id} />
                      <ConfirmSubmit
                        confirm="تأكيد أن هذا الإعلان تم بيعه؟"
                        className="act-btn bg-blue-50 text-blue-700 hover:bg-blue-100"
                      >
                        <BadgeCheck className="size-3.5" />
                        تم البيع
                      </ConfirmSubmit>
                    </form>
                  )}
                  {canRelist && (
                    <form action={relistAction}>
                      <input type="hidden" name="listingId" value={l.id} />
                      <ConfirmSubmit className="act-btn bg-green-50 text-green-700 hover:bg-green-100">
                        <RotateCcw className="size-3.5" />
                        إعادة نشر
                      </ConfirmSubmit>
                    </form>
                  )}
                  <form action={deleteListingAction} className="ms-auto">
                    <input type="hidden" name="listingId" value={l.id} />
                    <ConfirmSubmit
                      confirm="حذف الإعلان نهائياً؟ لا يمكن التراجع."
                      className="act-btn bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      <Trash2 className="size-3.5" />
                      حذف
                    </ConfirmSubmit>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
