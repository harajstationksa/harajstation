import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  Eye,
  MapPin,
  Megaphone,
  MousePointerClick,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { finalizeExpiredCampaigns } from "@/lib/campaigns";
import { str, type SP } from "@/lib/listing-query";
import { cn, parseImages, timeAgo } from "@/lib/utils";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export const metadata = { title: "الحملات الإعلانية" };

const STATUS: Record<string, [string, string]> = {
  ACTIVE: ["نشطة", "bg-green-50 text-green-700 border-green-100"],
  COMPLETED: ["مكتملة", "bg-blue-50 text-blue-700 border-blue-100"],
  CANCELLED: ["ملغاة", "bg-neutral-100 text-neutral-500 border-neutral-200"],
};

const STATUS_TABS = [
  { key: undefined, label: "الكل" },
  { key: "ACTIVE", label: "نشطة" },
  { key: "COMPLETED", label: "مكتملة" },
  { key: "CANCELLED", label: "ملغاة" },
] as const;

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requireUser();
  await finalizeExpiredCampaigns();
  const sp = await searchParams;
  const statusFilter = str(sp.status);
  const catFilter = str(sp.category);

  const campaigns = await db.campaign.findMany({
    where: { ownerId: user.id },
    include: {
      listing: {
        include: {
          auction: true,
          category: {
            select: { id: true, slug: true, nameAr: true, icon: true, parent: { select: { id: true, slug: true, nameAr: true, icon: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // account-level totals strip (always over ALL campaigns, not the filtered view)
  const totals = campaigns.reduce(
    (acc, c) => ({
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      delivered: acc.delivered + c.delivered,
    }),
    { impressions: 0, clicks: 0, delivered: 0 }
  );
  const totalCtr =
    totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null;

  // category chips from the user's own campaigns (rolled up to main category)
  const catMap = new Map<string, { slug: string; nameAr: string; icon: string; count: number }>();
  for (const c of campaigns) {
    const root = c.listing.category.parent ?? c.listing.category;
    const entry = catMap.get(root.id) ?? { slug: root.slug, nameAr: root.nameAr, icon: root.icon, count: 0 };
    entry.count++;
    catMap.set(root.id, entry);
  }
  const catChips = [...catMap.values()].sort((a, b) => b.count - a.count);

  const filtered = campaigns.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (catFilter) {
      const root = c.listing.category.parent ?? c.listing.category;
      if (root.slug !== catFilter && c.listing.category.slug !== catFilter) return false;
    }
    return true;
  });

  const filterLink = (params: Record<string, string | undefined>) => {
    const merged = { status: statusFilter, category: catFilter, ...params };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
    return `/dashboard/campaigns${qs.size ? `?${qs}` : ""}`;
  };
  const hasFilters = !!(statusFilter || catFilter);

  const summary = [
    { icon: Eye, label: "إجمالي الظهور", value: totals.impressions.toLocaleString("en-US"), tile: "bg-blue-50 text-blue-600 border-blue-100" },
    { icon: MousePointerClick, label: "إجمالي النقرات", value: totals.clicks.toLocaleString("en-US"), tile: "bg-primary-50 text-primary-600 border-primary-100" },
    { icon: TrendingUp, label: "نسبة النقر", value: totalCtr != null ? `${totalCtr.toFixed(1)}%` : "—", tile: "bg-green-50 text-green-600 border-green-100" },
    { icon: Users, label: "زوار وصلوا لإعلاناتك", value: totals.delivered.toLocaleString("en-US"), tile: "bg-amber-50 text-amber-600 border-amber-100" },
  ];

  return (
    <div className="space-y-5">
      {/* ── header ── */}
      <div className="card p-5 flex items-center justify-between gap-3 flex-wrap bg-gradient-to-l from-white to-primary-50/60">
        <div className="flex items-center gap-4">
          <span className="size-12 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0">
            <Megaphone className="size-6" />
          </span>
          <div>
            <h1 className="section-title">الحملات الإعلانية</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              استهداف ذكي حسب فئة إعلانك — في الرئيسية والفئات ونتائج البحث
            </p>
          </div>
        </div>
        <Link href="/dashboard/campaigns/new" className="btn-primary">
          <Megaphone className="size-4" />
          حملة جديدة
        </Link>
      </div>

      {/* ── account totals ── */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {summary.map(({ icon: Icon, label, value, tile }) => (
            <div key={label} className="card p-4 flex items-center gap-3">
              <span className={`size-10 rounded-lg border flex items-center justify-center shrink-0 ${tile}`}>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="font-display font-extrabold text-xl tabular-nums leading-tight">{value}</p>
                <p className="text-[11px] text-neutral-500">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── filters ── */}
      {campaigns.length > 0 && (
        <div className="card overflow-hidden">
          {/* status tabs */}
          <div className="flex border-b border-neutral-100">
            {STATUS_TABS.map(({ key, label }) => {
              const count = key
                ? campaigns.filter((c) => c.status === key).length
                : campaigns.length;
              return (
                <Link
                  key={label}
                  href={filterLink({ status: key })}
                  className={cn(
                    "flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors",
                    statusFilter === key
                      ? "border-primary-500 text-primary-600 bg-primary-50/50"
                      : "border-transparent text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50"
                  )}
                >
                  {label}
                  <span className="text-[11px] text-neutral-400 tabular-nums">{count}</span>
                </Link>
              );
            })}
          </div>

          {/* category chips */}
          {catChips.length > 1 && (
            <div className="p-3 flex gap-2 overflow-x-auto no-scrollbar">
              <Link
                href={filterLink({ category: undefined })}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors",
                  !catFilter
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
                )}
              >
                كل الفئات
              </Link>
              {catChips.map((c) => (
                <Link
                  key={c.slug}
                  href={filterLink({ category: c.slug })}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors",
                    catFilter === c.slug
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
                  )}
                >
                  <CategoryIcon name={c.icon} className="size-3.5" />
                  {c.nameAr}
                  <span className={cn("text-[10px] tabular-nums", catFilter === c.slug ? "text-white/70" : "text-neutral-400")}>
                    {c.count}
                  </span>
                </Link>
              ))}
              {hasFilters && (
                <Link
                  href="/dashboard/campaigns"
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  <X className="size-3.5" />
                  مسح الفلاتر
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── campaign list ── */}
      {campaigns.length === 0 ? (
        <EmptyState
          title="لم تطلق أي حملة بعد"
          hint="روّج إعلانك لجمهور مستهدف واجلب زواراً حقيقيين مقابل نقاط"
          action={<Link href="/dashboard/campaigns/new" className="btn-primary mt-2">أطلق حملتك الأولى</Link>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="لا توجد حملات مطابقة للفلتر"
          hint="جرّب تغيير الحالة أو الفئة"
          action={<Link href="/dashboard/campaigns" className="btn-secondary mt-2">عرض كل الحملات</Link>}
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((c) => {
            const [label, cls] = STATUS[c.status] ?? [c.status, "bg-neutral-100 border-neutral-200"];
            const nowMs = new Date().getTime();
            const daysLeft = c.endsAt
              ? Math.max(0, Math.ceil((c.endsAt.getTime() - nowMs) / 86_400_000))
              : 0;
            const pct =
              c.days > 0 && c.endsAt
                ? c.status === "ACTIVE"
                  ? Math.min(
                      100,
                      Math.round(
                        ((nowMs - c.createdAt.getTime()) /
                          (c.endsAt.getTime() - c.createdAt.getTime())) *
                          100
                      )
                    )
                  : 100
                : 100;
            const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : null;
            const cover = parseImages(c.listing.images)[0];
            const rootCat = c.listing.category.parent ?? c.listing.category;
            return (
              <Link
                key={c.id}
                href={`/dashboard/campaigns/${c.id}`}
                className="card p-4 space-y-3 hover:ring-2 hover:ring-primary-500/60 hover:shadow-card-hover transition-all group"
              >
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cover}
                    alt=""
                    className="size-14 rounded-lg object-cover border border-neutral-100 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm line-clamp-1">{c.listing.title}</p>
                    <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-2 flex-wrap" suppressHydrationWarning>
                      <span className="flex items-center gap-1">
                        <CategoryIcon name={rootCat.icon} className="size-3" />
                        {rootCat.nameAr}
                      </span>
                      <span>{c.pointsSpent.toLocaleString("en-US")} نقطة · {timeAgo(c.createdAt)}</span>
                      <span className="flex items-center gap-0.5">
                        <MapPin className="size-3" />
                        {c.targetCity || "كل المدن"}
                      </span>
                    </p>
                  </div>
                  <span className={`tag border shrink-0 ${cls}`}>{label}</span>
                  <ChevronLeft className="size-4 text-neutral-300 group-hover:text-primary-500 ltr:rotate-180 shrink-0 transition-colors" />
                </div>

                {/* compact stat row */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: Eye, label: "ظهور", value: c.impressions.toLocaleString("en-US") },
                    { icon: MousePointerClick, label: "نقرات", value: c.clicks.toLocaleString("en-US") },
                    { icon: BarChart3, label: "CTR", value: ctr != null ? `${ctr.toFixed(1)}%` : "—" },
                  ].map(({ icon: Icon, label: slabel, value }) => (
                    <div key={slabel} className="rounded-lg bg-neutral-50 border border-neutral-100 px-3 py-2">
                      <p className="text-[10px] text-neutral-400 flex items-center gap-1">
                        <Icon className="size-3" />
                        {slabel}
                      </p>
                      <p className="font-display font-bold text-base tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>

                {c.days > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {c.status === "ACTIVE"
                          ? `باقي ${daysLeft} من ${c.days} ${c.days === 1 ? "يوم" : "أيام"}`
                          : `مدة الحملة: ${c.days} ${c.days === 1 ? "يوم" : "أيام"}`}
                      </span>
                      <span className="tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                      <div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <p className="text-xs text-neutral-400 flex items-center gap-1.5">
        <Users className="size-3.5" />
        الأرقام تحتسب زائراً واحداً لكل شبكة — إعادة تحميل الصفحة لا تضخّم النتائج.
      </p>
    </div>
  );
}
