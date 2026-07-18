import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Eye,
  Lightbulb,
  MapPin,
  MousePointerClick,
  Send,
  Square,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate, parseImages } from "@/lib/utils";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { cancelCampaignAction } from "../actions";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.dash.campaignDetail.title };
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { lang, t } = await getT();
  const d = t.dash.campaignDetail;
  const dc = t.dash.campaigns;
  const STATUS: Record<string, [string, string]> = {
    ACTIVE: [dc.stActive, "bg-green-50 text-green-700"],
    COMPLETED: [dc.stCompleted, "bg-blue-50 text-blue-700"],
    CANCELLED: [dc.stCancelled, "bg-neutral-100 text-neutral-500"],
  };
  const { id } = await params;
  const nowMs = new Date().getTime();

  const c = await db.campaign.findUnique({
    where: { id },
    include: {
      listing: { include: { auction: true, category: true } },
      impressionLogs: {
        where: { createdAt: { gt: new Date(nowMs - 14 * 86_400_000) } },
        select: { createdAt: true },
      },
    },
  });
  if (!c || c.ownerId !== user.id) notFound();

  const [label, cls] = STATUS[c.status] ?? [c.status, "bg-neutral-100"];
  const href = c.listing.auction
    ? `/auctions/${c.listing.auction.id}`
    : `/listings/${c.listingId}`;
  const cover = parseImages(c.listing.images)[0];
  const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : null;
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
      : 0;

  // ── daily unique impressions, last 14 days (or campaign age) ──
  const dayMs = 86_400_000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowDays = Math.min(
    14,
    Math.max(1, Math.ceil((nowMs - c.createdAt.getTime()) / dayMs))
  );
  const buckets: { key: string; label: string; count: number }[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d2 = new Date(today.getTime() - i * dayMs);
    buckets.push({
      key: d2.toISOString().slice(0, 10),
      label: d2.toLocaleDateString(lang === "en" ? "en-US" : "ar-SA", { day: "numeric", month: "short" }),
      count: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const log of c.impressionLogs) {
    const key = log.createdAt.toISOString().slice(0, 10);
    const bucket = byKey.get(key);
    if (bucket) bucket.count++;
  }
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  const kpis = [
    {
      icon: Eye,
      label: d.kImpressions,
      value: c.impressions.toLocaleString("en-US"),
      hint: d.kImpressionsHint,
    },
    {
      icon: MousePointerClick,
      label: d.kClicks,
      value: c.clicks.toLocaleString("en-US"),
      hint: d.kClicksHint,
    },
    {
      icon: TrendingUp,
      label: d.kCtr,
      value: ctr != null ? `${ctr.toFixed(1)}%` : "—",
      hint: d.kCtrHint,
    },
    {
      icon: Users,
      label: d.kReached,
      value: c.delivered.toLocaleString("en-US"),
      hint: d.kReachedHint,
    },
    {
      icon: Send,
      label: d.kNotified,
      value: c.notified.toLocaleString("en-US"),
      hint: d.kNotifiedHint,
    },
    {
      icon: Wallet,
      label: d.kSpent,
      value: c.pointsSpent.toLocaleString("en-US"),
      hint: dc.duration(c.days),
    },
  ];

  return (
    <div className="space-y-5">
      <Link
        href="/dashboard/campaigns"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-primary-600 transition-colors"
      >
        <ArrowRight className="size-4" />
        {d.allCampaigns}
      </Link>

      {/* ── header ── */}
      <div className="card p-4 sm:p-5 flex items-center gap-4 flex-wrap">
        <Link href={href} className="flex items-center gap-3 min-w-0 flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt=""
            className="size-16 rounded-xl object-cover border border-neutral-100 shrink-0"
          />
          <div className="min-w-0">
            <p className="font-bold line-clamp-1">{c.listing.title}</p>
            <p className="text-xs text-neutral-400 mt-1 flex items-center gap-2 flex-wrap">
              <span>{lang === "en" ? c.listing.category.nameEn : c.listing.category.nameAr}</span>
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                {c.targetCity || dc.allCities}
              </span>
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3" />
                {formatDate(c.createdAt, lang)}
                {c.endsAt && ` ← ${formatDate(c.endsAt, lang)}`}
              </span>
            </p>
          </div>
        </Link>
        <span className={`badge shrink-0 ${cls}`}>{label}</span>
      </div>

      {/* ── duration progress ── */}
      {c.days > 0 && (
        <div className="card p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {c.status === "ACTIVE" ? dc.daysLeft(daysLeft, c.days) : dc.duration(c.days)}
            </span>
            <span className="tabular-nums font-semibold">{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {kpis.map(({ icon: Icon, label: klabel, value, hint }) => (
          <div key={klabel} title={hint} className="card px-4 py-3.5">
            <p className="text-[11px] text-neutral-400 flex items-center gap-1.5">
              <Icon className="size-3.5" />
              {klabel}
            </p>
            <p className="font-display font-extrabold text-2xl tabular-nums mt-1 text-neutral-900">
              {value}
            </p>
            <p className="text-[10px] text-neutral-400 mt-0.5 leading-snug">{hint}</p>
          </div>
        ))}
      </div>

      {/* ── daily impressions ── */}
      <div className="card p-4 sm:p-5">
        <p className="font-bold text-sm">{d.dailyTitle}</p>
        <p className="text-xs text-neutral-400 mt-0.5 mb-4">
          {d.lastDays(windowDays)}
        </p>
        <div className="flex items-end gap-1 h-28" dir="rtl">
          {buckets.map((b) => (
            <div
              key={b.key}
              className="flex-1 flex flex-col items-center gap-1 min-w-0 group"
              title={d.barTitle(b.label, b.count.toLocaleString("en-US"))}
            >
              <span className="text-[10px] tabular-nums text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity">
                {b.count}
              </span>
              <div
                className="w-full max-w-7 rounded-t bg-primary-500 group-hover:bg-primary-600 transition-colors"
                style={{
                  height: `${Math.max(b.count > 0 ? 6 : 2, (b.count / maxCount) * 80)}px`,
                  backgroundColor: b.count === 0 ? "#e5e5e5" : undefined,
                }}
              />
              <span className="text-[9px] text-neutral-400 truncate w-full text-center">
                {b.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── advertiser insight ── */}
      <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-4 flex gap-3">
        <Lightbulb className="size-5 text-primary-600 shrink-0 mt-0.5" />
        <div className="text-sm text-neutral-700 leading-relaxed space-y-1">
          <p className="font-bold text-neutral-900">{d.insightTitle}</p>
          <p>
            {ctr == null
              ? d.insightNone
              : ctr >= 5
                ? d.insightGreat
                : ctr >= 2
                  ? d.insightGood
                  : d.insightLow}
          </p>
        </div>
      </div>

      {/* ── actions ── */}
      {c.status === "ACTIVE" && (
        <div className="flex justify-end">
          <form action={cancelCampaignAction}>
            <input type="hidden" name="campaignId" value={c.id} />
            <ConfirmSubmit
              confirm={d.stopConfirm}
              className="act-btn text-red-600 hover:bg-red-50"
            >
              <Square className="size-3.5" />
              {d.stopBtn}
            </ConfirmSubmit>
          </form>
        </div>
      )}
    </div>
  );
}
