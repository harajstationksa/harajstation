"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Eye,
  Info,
  Loader2,
  MapPin,
  Megaphone,
  Wallet,
} from "lucide-react";
import { createCampaignAction } from "@/app/(site)/dashboard/campaigns/actions";
import { CITIES } from "@/lib/constants";

/**
 * Estimated-reach model (transparent, deliberately conservative):
 *   activeMembers  — signed-in members seen on the platform in the last 7 days
 *                    (anonymous visits are mostly crawlers, so they don't count)
 *   IMPRESSIONS_PER_MEMBER_PER_WEEK — an active member visits a couple of times
 *                    a week and sees a pinned sponsored card on most of those
 *                    visits (home + category + search of their interest)
 *   cityFactor     — share of registered users living in the target city
 * The range shown is ±30% around the point estimate.
 */
function estimateReach(opts: {
  days: number;
  activeMembers: number;
  cityShare: number; // 0..1 (1 = all cities)
}) {
  const IMPRESSIONS_PER_MEMBER_PER_WEEK = 1.3;
  // Honest numbers only — no artificial floor. On a young platform "1 – 3"
  // is the truth; an inflated range would be lying to the advertiser who is
  // paying points for it.
  const point =
    opts.activeMembers * IMPRESSIONS_PER_MEMBER_PER_WEEK * (opts.days / 7) * opts.cityShare;
  return {
    low: Math.max(0, Math.floor(point * 0.7)),
    high: Math.max(1, Math.ceil(point * 1.3)),
  };
}

export function CampaignForm({
  listing,
  ratePerDay,
  dayOptions,
  balance,
  activeMembers,
  totalUsers,
  cityCounts,
}: {
  listing: { id: string; title: string; city: string };
  ratePerDay: number;
  dayOptions: number[];
  balance: number;
  /** distinct signed-in members active in the last 7 days (presence-derived) */
  activeMembers: number;
  totalUsers: number;
  /** registered users per city, e.g. { "الرياض": 120 } */
  cityCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [days, setDays] = useState(dayOptions[0] ?? 5);
  const [targetCity, setTargetCity] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const cost = days * ratePerDay;
  const affordable = cost <= balance;

  const cityShare = useMemo(() => {
    if (!targetCity) return 1;
    const inCity = cityCounts[targetCity] ?? 0;
    return Math.max(0.05, totalUsers > 0 ? inCity / totalUsers : 0.05);
  }, [targetCity, cityCounts, totalUsers]);

  const reach = estimateReach({ days, activeMembers, cityShare });
  const cityUsers = targetCity ? (cityCounts[targetCity] ?? 0) : totalUsers;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData();
    fd.set("listingId", listing.id);
    fd.set("days", String(days));
    fd.set("targetCity", targetCity);
    const res = await createCampaignAction(fd);
    setLoading(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    router.push("/dashboard/campaigns");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5 max-w-xl">
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2 text-primary-600">
          <Megaphone className="size-5" />
          <h2 className="font-bold text-neutral-900">حملة إعلانية ذكية</h2>
        </div>
        <p className="text-sm text-neutral-500 leading-relaxed">
          طوال مدة الحملة يظهر إعلانك <b>مثبّتاً في أول فئته</b> بإطار مميز
          «ممول» في الصفحة الرئيسية وصفحة الفئة ونتائج البحث في نفس فئة إعلانك،
          ويصل إشعار مستهدف للمستخدمين الأكثر اهتماماً بها.
        </p>

        <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-3">
          <p className="text-xs text-neutral-500 mb-0.5">الإعلان</p>
          <p className="font-semibold text-sm line-clamp-1">{listing.title}</p>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <CalendarDays className="size-4 text-neutral-400" />
            مدة الحملة (أيام)
          </label>
          <div className="flex gap-2 flex-wrap items-center">
            {dayOptions.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors cursor-pointer tabular-nums ${
                  days === d
                    ? "bg-primary-500 text-white border-primary-500"
                    : "bg-white text-neutral-600 border-neutral-200 hover:border-primary-400"
                }`}
              >
                {d} {d === 1 ? "يوم" : "أيام"}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={365}
              value={days === 0 ? "" : days}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setDays(Number.isNaN(v) ? 0 : Math.min(365, Math.max(0, v)));
              }}
              className="input w-28 text-center tabular-nums"
              placeholder="عدد مخصص"
              aria-label="عدد أيام مخصص"
            />
          </div>
          <p className="text-xs text-neutral-400 mt-1.5">
            اختر مدة سريعة أو اكتب أي عدد أيام تحتاجه (من يوم إلى 365 يوماً).
          </p>
        </div>

        {/* geo targeting */}
        <div>
          <label className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <MapPin className="size-4 text-neutral-400" />
            استهداف مدينة معينة <span className="text-neutral-400 font-normal">(اختياري)</span>
          </label>
          <select
            className="input"
            value={targetCity}
            onChange={(e) => setTargetCity(e.target.value)}
          >
            <option value="">كل المدن (تغطية أوسع)</option>
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
                {c === listing.city ? " — مدينة الإعلان" : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-neutral-400 mt-1.5">
            {targetCity
              ? `الحملة ستركّز على ${targetCity} — ${cityUsers.toLocaleString("en-US")} مستخدم مسجّل هناك.`
              : "بدون تحديد، يظهر إعلانك لكل زوار المنصة."}
          </p>
        </div>

        {/* estimated reach */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 flex items-center gap-3">
          <span className="size-10 rounded-lg bg-white border border-neutral-200 flex items-center justify-center shrink-0">
            <Eye className="size-5 text-primary-500" />
          </span>
          <div className="flex-1">
            <p className="text-xs text-neutral-500">المشاهدات المتوقعة للحملة (تقديري)</p>
            <p className="font-display font-extrabold text-xl tabular-nums text-neutral-900">
              {reach.low.toLocaleString("en-US")} – {reach.high.toLocaleString("en-US")}
              <span className="text-xs font-normal text-neutral-400"> ظهور</span>
            </p>
          </div>
        </div>
        <p className="text-[11px] text-neutral-400 -mt-2">
          تقدير مبني على الأعضاء النشطين فعلياً على المنصة خلال آخر ٧ أيام
          {targetCity ? ` ونسبة مستخدمي ${targetCity}` : ""} — الأرقام الحقيقية قد تختلف.
        </p>

        {/* cost summary */}
        <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-neutral-600">
              <CalendarDays className="size-4" />
              {days} {days === 1 ? "يوم" : "أيام"} × {ratePerDay} نقطة
            </span>
            <span className="font-display font-extrabold text-2xl text-primary-600 tabular-nums">
              {cost.toLocaleString("en-US")}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-neutral-500 border-t border-primary-100 pt-2">
            <span className="flex items-center gap-1.5">
              <Wallet className="size-3.5" />
              رصيدك: {balance.toLocaleString("en-US")} نقطة
            </span>
            {!affordable && (
              <a href="/dashboard/wallet" className="text-primary-600 font-semibold hover:underline">
                اشحن نقاطك
              </a>
            )}
          </div>
        </div>

        <p className="flex items-start gap-1.5 text-xs text-neutral-400">
          <Info className="size-3.5 shrink-0 mt-0.5" />
          الأسعار والمدد المتاحة قابلة للتغيير من إدارة حراج ستيشن في أي وقت.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      <button className="btn-primary w-full text-base" disabled={loading || !affordable || days < 1}>
        {loading && <Loader2 className="size-4 animate-spin" />}
        <Megaphone className="size-4" />
        إطلاق الحملة ({cost.toLocaleString("en-US")} نقطة)
      </button>
    </form>
  );
}
