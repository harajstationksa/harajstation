import {
  BadgeCheck,
  Handshake,
  History,
  Hourglass,
  ShieldCheck,
  Star,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatSAR, timeAgo, trustLevel } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { ConfirmCard, type ConfirmTx } from "@/components/ConfirmCard";
import { EmptyState } from "@/components/EmptyState";
import { RateForm } from "@/components/RateForm";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.dash.verifications.title };
}

export default async function VerificationsPage() {
  const user = await requireUser();
  const { lang, t } = await getT();
  const d = t.dash.verifications;
  const STATUS_LABEL: Record<string, [string, string]> = {
    CONFIRMED: [d.stConfirmed, "bg-green-50 text-green-700 border-green-100"],
    CANCELLED: [d.stCancelled, "bg-neutral-100 text-neutral-600 border-neutral-200"],
    DISPUTED: [d.stDisputed, "bg-red-50 text-red-600 border-red-100"],
    EXPIRED: [d.stExpired, "bg-amber-50 text-amber-700 border-amber-100"],
  };

  const txs = await db.transaction.findMany({
    where: { OR: [{ sellerId: user.id }, { buyerId: user.id }] },
    include: {
      listing: true,
      seller: true,
      buyer: true,
      dispute: { include: { evidences: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const myReviews = await db.review.findMany({
    where: { authorId: user.id, transactionId: { in: txs.map((t) => t.id) } },
    select: { transactionId: true },
  });
  const reviewed = new Set(myReviews.map((r) => r.transactionId));

  const open = txs.filter((t) => t.status === "PENDING" || t.status === "DISPUTED");
  const history = txs.filter((t) => t.status !== "PENDING" && t.status !== "DISPUTED");
  const confirmed = txs.filter((t) => t.status === "CONFIRMED").length;
  const closed = history.length;
  const successRate = closed > 0 ? Math.round((confirmed / closed) * 100) : null;
  const level = trustLevel(user.credibility);

  const summary = [
    {
      icon: Hourglass,
      label: d.sumOpen,
      value: open.length.toLocaleString("en-US"),
      tile: "bg-amber-50 text-amber-600 border-amber-100",
    },
    {
      icon: BadgeCheck,
      label: d.sumConfirmed,
      value: confirmed.toLocaleString("en-US"),
      tile: "bg-green-50 text-green-600 border-green-100",
    },
    {
      icon: TrendingUp,
      label: d.sumRate,
      value: successRate != null ? `${successRate}%` : "—",
      tile: "bg-blue-50 text-blue-600 border-blue-100",
    },
    {
      icon: Star,
      label: d.sumCred,
      value: `${user.credibility}/100`,
      tile: "bg-primary-50 text-primary-600 border-primary-100",
      valueColor: level.color,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── header ── */}
      <div className="card p-5 flex items-center gap-4 bg-gradient-to-l from-white to-primary-50/60">
        <span className="size-12 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0">
          <ShieldCheck className="size-6" />
        </span>
        <div>
          <h1 className="section-title">{d.title}</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {d.sub}
          </p>
        </div>
      </div>

      {/* ── summary strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summary.map(({ icon: Icon, label, value, tile, valueColor }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <span
              className={`size-10 rounded-lg border flex items-center justify-center shrink-0 ${tile}`}
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p
                className="font-display font-extrabold text-xl tabular-nums leading-tight"
                style={valueColor ? { color: valueColor } : undefined}
              >
                {value}
              </p>
              <p className="text-[11px] text-neutral-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── how it works ── */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/60">
          <p className="text-sm font-bold text-neutral-700">{d.howTitle}</p>
        </div>
        <div className="p-4 grid sm:grid-cols-3 gap-4 text-sm">
          {[
            { n: "1", icon: Handshake, title: d.how1t, sub: d.how1s },
            { n: "2", icon: UserCheck, title: d.how2t, sub: d.how2s },
            { n: "3", icon: Star, title: d.how3t, sub: d.how3s },
          ].map(({ n, icon: Icon, title, sub }) => (
            <div key={title} className="flex gap-3">
              <div className="relative shrink-0">
                <span className="size-10 rounded-lg bg-primary-50 border border-primary-100 text-primary-600 flex items-center justify-center">
                  <Icon className="size-5" />
                </span>
                <span className="absolute -top-1.5 -start-1.5 size-4.5 rounded-md bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center">
                  {n}
                </span>
              </div>
              <div>
                <p className="font-bold text-neutral-900">{title}</p>
                <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── open confirmations ── */}
      <div className="space-y-3">
        <h2 className="font-bold flex items-center gap-2">
          <span className="size-7 rounded-md bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center">
            <Hourglass className="size-4" />
          </span>
          {d.openTitle}
          {open.length > 0 && (
            <span className="tag bg-amber-50 text-amber-700 border border-amber-100">{open.length}</span>
          )}
        </h2>
        {open.length === 0 ? (
          <EmptyState
            title={d.openEmpty}
            hint={d.openEmptyHint}
          />
        ) : (
          <div className="grid gap-4">
            {open.map((t) => {
              const role = t.sellerId === user.id ? "SELLER" : "BUYER";
              const counterpart = role === "SELLER" ? t.buyer : t.seller;
              const tx: ConfirmTx = {
                id: t.id,
                role,
                title: t.listing.title,
                amount: t.amount,
                deadline: t.deadline.toISOString(),
                status: t.status,
                myAnswer: role === "SELLER" ? t.sellerAnswer : t.buyerAnswer,
                otherAnswered: !!(role === "SELLER" ? t.buyerAnswer : t.sellerAnswer),
                counterpart: {
                  id: counterpart.id,
                  name: counterpart.name,
                  phone: counterpart.phone,
                },
                listingId: t.listingId,
                evidenceSubmitted:
                  t.dispute?.evidences.some((ev) => ev.userId === user.id) ?? false,
              };
              return <ConfirmCard key={t.id} tx={tx} />;
            })}
          </div>
        )}
      </div>

      {/* ── history ── */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-bold flex items-center gap-2">
            <span className="size-7 rounded-md bg-neutral-100 border border-neutral-200 text-neutral-500 flex items-center justify-center">
              <History className="size-4" />
            </span>
            {d.historyTitle}
            <span className="tag bg-neutral-100 text-neutral-500 border border-neutral-200">{history.length}</span>
          </h2>
          <div className="card overflow-hidden">
            <ul className="divide-y divide-neutral-50">
              {history.map((t) => {
                const [label, cls] = STATUS_LABEL[t.status] ?? [t.status, "bg-neutral-100 border-neutral-200"];
                const other = t.sellerId === user.id ? t.buyer : t.seller;
                return (
                  <li key={t.id} className="px-4 py-3 text-sm hover:bg-neutral-50/60 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          name={other.name}
                          color={other.avatarColor}
                          src={other.avatarUrl}
                          pro={other.isPro}
                          className="size-9 text-sm"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold line-clamp-1">{t.listing.title}</p>
                          <p className="text-xs text-neutral-500" suppressHydrationWarning>
                            {t.sellerId === user.id ? d.soldTo : d.boughtFrom} {other.name} ·{" "}
                            {formatSAR(t.amount)} · {timeAgo(t.createdAt, lang)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {t.status === "CONFIRMED" && !reviewed.has(t.id) && (
                          <RateForm transactionId={t.id} targetName={other.name} />
                        )}
                        <span className={`tag border ${cls}`}>{label}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
