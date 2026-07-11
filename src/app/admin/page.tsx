import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Coins,
  Flag,
  Gavel,
  ListChecks,
  Megaphone,
  Scale,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/constants";
import { onlineNow } from "@/lib/presence";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export const metadata = { title: "لوحة الإدارة" };

const DAY = 86_400_000;

/** Bucket createdAt timestamps into the last N days (oldest → newest). */
function bucketByDay(dates: Date[], days: number): number[] {
  const out = new Array<number>(days).fill(0);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime() - (days - 1) * DAY;
  for (const d of dates) {
    const idx = Math.floor((d.getTime() - startMs) / DAY);
    if (idx >= 0 && idx < days) out[idx] += 1;
  }
  return out;
}

/** Short Arabic weekday labels for the last N days (oldest → newest). */
function dayLabels(days: number): string[] {
  const fmt = new Intl.DateTimeFormat("ar", { weekday: "short" });
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, i) =>
    fmt.format(new Date(start.getTime() - (days - 1 - i) * DAY))
  );
}

function BarChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(1, ...data);
  const labels = dayLabels(data.length);
  return (
    <div className="flex items-end gap-1.5 h-24">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
          <span className="text-[10px] font-bold text-neutral-500 tabular-nums">{v}</span>
          <div
            className={`w-full rounded-sm ${color} transition-all`}
            style={{ height: `${Math.max(4, (v / max) * 70)}%` }}
          />
          <span className="text-[9px] text-neutral-400">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

export default async function AdminDashboard() {
  const me = await requireStaff(STAFF_ROLES);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY);

  const [
    userCount,
    newUsersRows,
    listingCount,
    newListingsRows,
    liveAuctions,
    openDisputes,
    openReports,
    activeCampaigns,
    campaignTotals,
    proCount,
    bannerClicks,
    pendingTx,
    auditLogs,
    recentUsers,
    recentListings,
    online,
  ] = await Promise.all([
    db.user.count(),
    db.user.findMany({ where: { createdAt: { gte: weekAgo } }, select: { createdAt: true } }),
    db.listing.count({ where: { status: "ACTIVE" } }),
    db.listing.findMany({ where: { createdAt: { gte: weekAgo } }, select: { createdAt: true } }),
    db.auction.count({ where: { status: "LIVE", endsAt: { gt: now } } }),
    db.dispute.count({ where: { status: "OPEN" } }),
    db.report.count({ where: { status: "OPEN" } }),
    db.campaign.count({ where: { status: "ACTIVE" } }),
    db.campaign.aggregate({ _sum: { pointsSpent: true } }),
    db.user.count({ where: { isPro: true } }),
    db.banner.aggregate({ _sum: { clicks: true } }),
    db.transaction.count({ where: { status: "PENDING" } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    db.user.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    db.listing.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { seller: true, auction: true },
    }),
    onlineNow(),
  ]);

  const usersByDay = bucketByDay(newUsersRows.map((r) => r.createdAt), 7);
  const listingsByDay = bucketByDay(newListingsRows.map((r) => r.createdAt), 7);

  const stats = [
    { label: "المستخدمون", value: userCount, sub: `+${newUsersRows.length} هذا الأسبوع`, icon: Users, href: "/admin/users" },
    { label: "إعلانات نشطة", value: listingCount, sub: `+${newListingsRows.length} هذا الأسبوع`, icon: ListChecks, href: "/admin/listings" },
    { label: "مزادات مباشرة", value: liveAuctions, sub: "الآن", icon: Gavel, href: "/admin/bids" },
    { label: "اشتراكات برو", value: proCount, sub: "مشترك", icon: Wallet, href: "/admin/plans" },
    { label: "حملات نشطة", value: activeCampaigns, sub: `${(campaignTotals._sum.pointsSpent ?? 0).toLocaleString("en-US")} نقطة مصروفة`, icon: Megaphone, href: "/admin/campaigns" },
    { label: "نقرات البانرات", value: bannerClicks._sum.clicks ?? 0, sub: "إجمالي", icon: TrendingUp, href: "/admin/banners" },
  ];

  // action-needed queue
  const queue = [
    { label: "نزاعات تحتاج قراراً", value: openDisputes, icon: Scale, href: "/admin/disputes", cls: "text-red-600 bg-red-50" },
    { label: "بلاغات مفتوحة", value: openReports, icon: Flag, href: "/admin/reports", cls: "text-amber-600 bg-amber-50" },
    { label: "معاملات بانتظار التأكيد", value: pendingTx, icon: AlertTriangle, href: "/admin/disputes", cls: "text-blue-600 bg-blue-50" },
  ].filter((i) => i.value > 0);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={20} />
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="section-title">لوحة المعلومات</h1>
          <p className="text-sm text-neutral-500 mt-1">أهلاً {me.name} — هذه نظرة حية على المنصة</p>
        </div>
        <span className="badge bg-green-50 text-green-700 border border-green-100">
          <span className="size-2 rounded-full bg-green-500 animate-live-pulse" />
          مباشر — يتحدث كل 20 ثانية
        </span>
      </div>

      {/* ── online now ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="font-bold flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-green-500 animate-live-pulse" />
            المتواجدون الآن على الموقع
          </p>
          <p className="text-xs text-neutral-400">خلال آخر 5 دقائق</p>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "إجمالي المتواجدين", value: online.total },
            { label: "أعضاء مسجلون", value: online.members.length },
            { label: "زوار", value: online.guests },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3 text-center">
              <p className="font-display font-extrabold text-3xl text-neutral-900 tabular-nums">{value}</p>
              <p className="text-xs text-neutral-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
        {online.members.length > 0 ? (
          <div className="flex items-center gap-2 flex-wrap">
            {online.members.slice(0, 12).map((m) => (
              <Link
                key={m.key}
                href={`/admin/users?q=${encodeURIComponent(m.userName ?? "")}`}
                className="chip hover:bg-primary-50 hover:text-primary-700 transition-colors"
              >
                <span className="size-1.5 rounded-full bg-green-500" />
                {m.userName}
              </Link>
            ))}
            {online.members.length > 12 && (
              <span className="text-xs text-neutral-400">+{online.members.length - 12} آخرون</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-neutral-400">لا يوجد أعضاء مسجلون متصفحون الآن — {online.guests > 0 ? `${online.guests} زائر غير مسجل` : "الموقع هادئ حالياً"}</p>
        )}
      </div>

      {/* action-needed */}
      {queue.length > 0 && (
        <div className="grid sm:grid-cols-3 gap-3">
          {queue.map(({ label, value, icon: Icon, href, cls }) => (
            <Link key={label} href={href} className="card p-4 flex items-center gap-3 hover:shadow-card-hover transition-shadow">
              <span className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${cls}`}>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display font-extrabold text-xl leading-none">{value}</p>
                <p className="text-xs text-neutral-500 mt-1">{label}</p>
              </div>
              <ArrowUpRight className="size-4 text-neutral-300" />
            </Link>
          ))}
        </div>
      )}

      {/* stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {stats.map(({ label, value, sub, icon: Icon, href }) => (
          <Link key={label} href={href} className="card p-4 hover:shadow-card-hover transition-shadow">
            <div className="flex items-center justify-between">
              <span className="size-9 rounded-lg bg-neutral-100 text-neutral-600 flex items-center justify-center">
                <Icon className="size-4.5" />
              </span>
              <ArrowUpRight className="size-4 text-neutral-300" />
            </div>
            <p className="font-display font-extrabold text-2xl mt-3">{value.toLocaleString("en-US")}</p>
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="text-xs text-neutral-400 mt-0.5">{sub}</p>
          </Link>
        ))}
      </div>

      {/* 7-day charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="font-bold text-sm">إعلانات جديدة — آخر 7 أيام</p>
            <span className="chip">{newListingsRows.length} إجمالي</span>
          </div>
          <BarChart data={listingsByDay} color="bg-primary-500" />
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="font-bold text-sm">مستخدمون جدد — آخر 7 أيام</p>
            <span className="chip">{newUsersRows.length} إجمالي</span>
          </div>
          <BarChart data={usersByDay} color="bg-neutral-700" />
        </div>
      </div>

      {/* recent listings + users + audit */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm">
            أحدث الإعلانات
          </div>
          <ul className="divide-y divide-neutral-50">
            {recentListings.map((l) => (
              <li key={l.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="badge bg-neutral-900 text-white font-mono text-[10px] shrink-0">{l.ref}</span>
                  <Link
                    href={l.auction ? `/auctions/${l.auction.id}` : `/listings/${l.id}`}
                    className="font-medium hover:text-primary-600 truncate"
                  >
                    {l.title}
                  </Link>
                </div>
                <span className="text-xs text-neutral-400 shrink-0" suppressHydrationWarning>
                  {timeAgo(l.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm">
            أحدث المستخدمين
          </div>
          <ul className="divide-y divide-neutral-50">
            {recentUsers.map((u) => (
              <li key={u.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={u.name} color={u.avatarColor} src={u.avatarUrl} className="size-7 text-xs" />
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{u.name}</p>
                    <p className="text-xs text-neutral-400">{u.city}</p>
                  </div>
                </div>
                <span className="text-xs text-neutral-400 shrink-0" suppressHydrationWarning>
                  {timeAgo(u.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* audit log */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm flex items-center justify-between">
          <span>سجل النظام (Audit Log)</span>
          <Link href="/admin/staff" className="text-xs text-primary-600 hover:underline">عرض الفريق</Link>
        </div>
        {auditLogs.length === 0 ? (
          <p className="p-6 text-sm text-neutral-400 text-center">لا توجد عمليات مسجلة بعد</p>
        ) : (
          <ul className="divide-y divide-neutral-50">
            {auditLogs.map((log) => (
              <li key={log.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono text-xs bg-neutral-100 rounded px-1.5 py-0.5">{log.action}</span>
                  <span className="text-neutral-600 ms-2 text-xs">{log.detail}</span>
                </div>
                <span className="text-xs text-neutral-400 shrink-0" suppressHydrationWarning>
                  {timeAgo(log.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* finance mini-summary */}
      <div className="card p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="size-10 rounded-lg bg-green-50 text-success flex items-center justify-center">
            <Coins className="size-5" />
          </span>
          <div>
            <p className="font-bold text-sm">ملخص مالي سريع</p>
            <p className="text-xs text-neutral-500">
              {proCount} اشتراك برو · {(campaignTotals._sum.pointsSpent ?? 0).toLocaleString("en-US")} نقطة مصروفة على الحملات
            </p>
          </div>
        </div>
        {me.role === "ADMIN" && (
          <Link href="/admin/points" className="btn-secondary">إدارة النقاط والأسعار</Link>
        )}
      </div>
    </div>
  );
}
