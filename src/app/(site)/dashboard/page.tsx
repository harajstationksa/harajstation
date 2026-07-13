import Link from "next/link";
import {
  Coins,
  Gavel,
  Gift,
  Heart,
  ListChecks,
  Megaphone,
  MessageSquare,
  Plus,
  Settings,
  ShieldCheck,
  Star,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate, formatSAR, timeAgo, trustLevel } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { claimDailyAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "لوحة التحكم" };

export default async function DashboardPage() {
  // run before fetching the user so an expired promo shows correctly right away
  const user = await requireUser();

  // daily free points — claimable once per day, amount depends on the plan
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const canClaimDaily = !user.lastDailyAt || user.lastDailyAt < startOfToday;
  const plan = await db.plan.findUnique({
    where: { key: user.isPro ? "PRO_MONTHLY" : "FREE" },
  });
  const dailyPoints = plan?.dailyPoints ?? 5;

  const [activeListings, activeAuctions, participated, pendingTx, credLogs] =
    await Promise.all([
      db.listing.count({
        where: { sellerId: user.id, status: "ACTIVE", type: "STANDARD" },
      }),
      db.listing.count({
        where: { sellerId: user.id, status: "ACTIVE", type: "AUCTION" },
      }),
      db.bid.groupBy({ by: ["auctionId"], where: { bidderId: user.id } }),
      db.transaction.findMany({
        where: {
          status: { in: ["PENDING", "DISPUTED"] },
          OR: [{ sellerId: user.id }, { buyerId: user.id }],
        },
        include: { listing: true },
        orderBy: { deadline: "asc" },
      }),
      db.credibilityLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  const level = trustLevel(user.credibility);

  const stats = [
    { label: "إعلاناتي النشطة", value: activeListings, icon: ListChecks, color: "text-neutral-600 bg-neutral-100", href: "/dashboard/listings" },
    { label: "مزاداتي النشطة", value: activeAuctions, icon: Gavel, color: "text-red-600 bg-red-50", href: "/dashboard/listings" },
    { label: "مزادات شاركت فيها", value: participated.length, icon: TrendingUp, color: "text-blue-600 bg-blue-50", href: "/auctions" },
    { label: "معاملات ناجحة", value: user.successfulTx, icon: ShieldCheck, color: "text-green-600 bg-green-50", href: "/dashboard/verifications" },
    { label: "نقاطي", value: user.points, icon: Coins, color: "text-primary-600 bg-primary-50", href: "/dashboard/wallet" },
  ];

  const quickActions = [
    { label: "إعلاناتي", icon: ListChecks, href: "/dashboard/listings" },
    { label: "حملاتي الإعلانية", icon: Megaphone, href: "/dashboard/campaigns" },
    { label: "الرسائل", icon: MessageSquare, href: "/dashboard/messages" },
    { label: "المفضلة", icon: Heart, href: "/dashboard/favorites" },
    { label: "محفظة النقاط", icon: Wallet, href: "/dashboard/wallet" },
    { label: "الإعدادات", icon: Settings, href: "/dashboard/settings" },
  ];

  return (
    <div className="space-y-6">
      {/* ── welcome hero ── */}
      <div className="rounded-2xl bg-gradient-to-l from-neutral-900 to-neutral-800 text-white p-6 sm:p-8 flex items-center justify-between gap-5 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar
            name={user.name}
            color={user.avatarColor}
            src={user.avatarUrl}
            pro={user.isPro}
            className="size-16 sm:size-20 text-2xl border-2 border-white/20"
          />
          <div className="min-w-0">
            <p className="text-neutral-400 text-sm">أهلاً بعودتك 👋</p>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl truncate">{user.name}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="tag bg-white/10 text-white">
                <Star className="size-3 fill-current" style={{ color: level.color }} />
                {level.label} · {user.credibility}/100
              </span>
              <span className="tag bg-primary-500 text-white">
                <Coins className="size-3" />
                {user.points.toLocaleString("en-US")} نقطة
              </span>
              {user.isPro && (
                <span className="tag bg-white/10 text-primary-400 font-bold">
                  PRO
                  {user.proUntil && (
                    <span className="font-normal text-neutral-300">
                      حتى {formatDate(user.proUntil)}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <Link href="/sell" className="btn-primary">
            <Plus className="size-4" />
            أضف إعلاناً
          </Link>
          <Link href="/dashboard/campaigns/new" className="btn bg-white/10 text-white hover:bg-white/20">
            <Megaphone className="size-4" />
            روّج إعلانك
          </Link>
        </div>
      </div>

      {/* daily free points — claim button */}
      <div className="card border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="size-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <Coins className="size-5" />
          </span>
          <div>
            <p className="font-bold text-sm text-amber-900">نقاطك اليومية المجانية</p>
            <p className="text-xs text-amber-700">
              {canClaimDaily
                ? `اجمع ${dailyPoints} نقطة اليوم — تُستخدم للتمييز والحملات`
                : "جمعت نقاط اليوم — عُد غداً للمزيد"}
            </p>
          </div>
        </div>
        {canClaimDaily ? (
          <form action={claimDailyAction}>
            <ConfirmSubmit className="btn-primary shrink-0">
              <Gift className="size-4" />
              اجمع {dailyPoints}
            </ConfirmSubmit>
          </form>
        ) : (
          <span className="badge bg-amber-100 text-amber-700 shrink-0">تم الجمع اليوم</span>
        )}
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {stats.map(({ label, value, icon: Icon, color, href }) => (
          <Link
            key={label}
            href={href}
            className="card p-5 flex flex-col gap-3 hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
          >
            <span className={`size-11 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="size-5.5" />
            </span>
            <div>
              <p className="font-display font-extrabold text-3xl leading-none tabular-nums">
                {value.toLocaleString("en-US")}
              </p>
              <p className="text-xs text-neutral-500 mt-1.5">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* quick actions */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {quickActions.map(({ label, icon: Icon, href }) => (
          <Link
            key={href}
            href={href}
            className="card p-4 flex flex-col items-center gap-2 text-center hover:ring-2 hover:ring-primary-500/40 hover:shadow-card-hover transition-all"
          >
            <span className="size-10 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center">
              <Icon className="size-5" />
            </span>
            <span className="text-xs font-semibold text-neutral-700">{label}</span>
          </Link>
        ))}
      </div>

      {/* pending confirmations callout */}
      {pendingTx.length > 0 && (
        <Link
          href="/dashboard/verifications"
          className="card border-amber-200 bg-amber-50 p-4 flex items-center gap-3 hover:shadow-card-hover transition-shadow"
        >
          <ShieldCheck className="size-6 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-amber-900">
              لديك {pendingTx.length} معاملة بانتظار التأكيد
            </p>
            <p className="text-sm text-amber-800 mt-0.5">
              أكد التسليم/الاستلام خلال المهلة للحفاظ على نقاط مصداقيتك
            </p>
          </div>
          <span className="btn-primary max-sm:hidden">التحققات</span>
        </Link>
      )}

      {/* credibility */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2">
            <Star className="size-5 text-amber-500 fill-current" />
            نقاط المصداقية
          </h2>
          <span className="font-display font-extrabold text-2xl" style={{ color: level.color }}>
            {user.credibility}/100
          </span>
        </div>
        <div className="h-3 rounded-full bg-neutral-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${user.credibility}%`, backgroundColor: level.color }}
          />
        </div>
        <p className="text-sm text-neutral-500">
          مستواك: <span className="font-bold" style={{ color: level.color }}>{level.label}</span>
          {" — "}تزيد النقاط بالمعاملات المؤكدة من الطرفين (+5) وتنقص بتجاهل
          التأكيد (-3) أو النزاعات الخاسرة (-15).
        </p>

        {credLogs.length > 0 && (
          <ul className="divide-y divide-neutral-50 text-sm">
            {credLogs.map((log) => (
              <li key={log.id} className="py-2 flex items-center justify-between gap-3">
                <span className="text-neutral-600">{log.reason}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className={log.delta >= 0 ? "text-success font-bold" : "text-danger font-bold"}>
                    {log.delta > 0 ? `+${log.delta}` : log.delta}
                  </span>
                  <span className="text-xs text-neutral-400" suppressHydrationWarning>
                    {timeAgo(log.createdAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* pending list preview */}
      {pendingTx.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm">
            معاملات قيد التحقق
          </div>
          <ul className="divide-y divide-neutral-50">
            {pendingTx.map((t) => (
              <li key={t.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold line-clamp-1">{t.listing.title}</p>
                  <p className="text-xs text-neutral-500">
                    {t.sellerId === user.id ? "أنت البائع" : "أنت المشتري"} · {formatSAR(t.amount)}
                  </p>
                </div>
                <span
                  className={`badge shrink-0 ${
                    t.status === "DISPUTED"
                      ? "bg-red-50 text-red-600"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {t.status === "DISPUTED" ? "متنازع عليها" : "بانتظار التأكيد"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
