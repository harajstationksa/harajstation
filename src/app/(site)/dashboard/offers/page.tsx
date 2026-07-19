import Link from "next/link";
import { Check, HandCoins, RotateCcw, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { cn, formatSAR, parseImages, timeAgo } from "@/lib/utils";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { EmptyState } from "@/components/EmptyState";
import { CounterOfferForm } from "@/components/CounterOfferForm";
import {
  acceptCounterForm,
  acceptOfferForm,
  rejectOfferForm,
  withdrawOfferForm,
} from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.offers.title };
}

const STATUS_CLS: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  COUNTERED: "bg-sky-50 text-sky-700",
  ACCEPTED: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-600",
  WITHDRAWN: "bg-neutral-100 text-neutral-500",
};

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const { lang, t } = await getT();
  const o = t.offers;
  const { tab } = await searchParams;
  const activeTab = tab === "sent" ? "sent" : "received";

  const [received, sent] = await Promise.all([
    db.offer.findMany({
      where: { listing: { sellerId: user.id } },
      include: {
        listing: { select: { id: true, title: true, images: true, price: true } },
        buyer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.offer.findMany({
      where: { buyerId: user.id },
      include: {
        listing: { select: { id: true, title: true, images: true, price: true } },
        buyer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const rows = activeTab === "received" ? received : sent;
  const pendingReceived = received.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-5">
      <h1 className="section-title flex items-center gap-2">
        <HandCoins className="size-6 text-primary-500" />
        {o.title}
      </h1>

      {/* tabs */}
      <div className="card p-2 flex gap-1.5">
        {(
          [
            ["received", `${o.tabReceived}${pendingReceived ? ` (${pendingReceived})` : ""}`],
            ["sent", o.tabSent],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={key === "received" ? "/dashboard/offers" : "/dashboard/offers?tab=sent"}
            className={cn(
              "flex-1 text-center rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              activeTab === key
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-50"
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={activeTab === "received" ? o.emptyReceived : o.emptySent}
          hint={activeTab === "received" ? o.emptyReceivedHint : o.emptySentHint}
        />
      ) : (
        <div className="card overflow-hidden divide-y divide-neutral-100">
          {rows.map((offer) => {
            const cover = parseImages(offer.listing.images)[0];
            return (
              <div key={offer.id} className="p-3.5 space-y-2.5">
                <div className="flex items-center gap-3">
                  <Link href={`/listings/${offer.listing.id}`} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cover}
                      alt=""
                      className="size-14 rounded-lg object-cover border border-neutral-100"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/listings/${offer.listing.id}`}
                      className="font-semibold text-sm line-clamp-1 hover:text-primary-600"
                    >
                      {offer.listing.title}
                    </Link>
                    <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {activeTab === "received" && (
                        <>
                          <Link
                            href={`/profile/${offer.buyer.id}`}
                            className="text-neutral-600 hover:text-primary-600 font-medium"
                          >
                            {offer.buyer.name}
                          </Link>
                          <span>·</span>
                        </>
                      )}
                      <span suppressHydrationWarning>{timeAgo(offer.createdAt, lang)}</span>
                      {offer.listing.price != null && (
                        <>
                          <span>·</span>
                          <span>
                            {o.listedAt} {formatSAR(offer.listing.price)}
                          </span>
                        </>
                      )}
                    </p>
                    {offer.note && (
                      <p className="text-xs text-neutral-500 mt-1 line-clamp-1">«{offer.note}»</p>
                    )}
                  </div>
                  <div className="text-left shrink-0">
                    <p className="font-display font-extrabold text-primary-600 tabular-nums">
                      {formatSAR(offer.amount)}
                    </p>
                    <span className={`badge mt-1 ${STATUS_CLS[offer.status] ?? "bg-neutral-100"}`}>
                      {o.status[offer.status] ?? offer.status}
                    </span>
                  </div>
                </div>

                {offer.status === "COUNTERED" && (
                  <p className="text-xs text-sky-800 bg-sky-50 rounded-lg px-3 py-1.5 w-fit">
                    {o.counterIs}{" "}
                    <b className="tabular-nums">{formatSAR(offer.counterAmount ?? 0)}</b>
                  </p>
                )}

                {/* seller decisions on a fresh offer */}
                {activeTab === "received" && offer.status === "PENDING" && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <form action={acceptOfferForm}>
                      <input type="hidden" name="offerId" value={offer.id} />
                      <ConfirmSubmit
                        confirm={o.acceptConfirm(formatSAR(offer.amount))}
                        className="act-btn bg-green-50 text-green-700 hover:bg-green-100"
                      >
                        <Check className="size-3.5" />
                        {o.accept}
                      </ConfirmSubmit>
                    </form>
                    <CounterOfferForm offerId={offer.id} />
                    <form action={rejectOfferForm}>
                      <input type="hidden" name="offerId" value={offer.id} />
                      <ConfirmSubmit
                        confirm={o.rejectConfirm}
                        className="act-btn bg-red-50 text-red-600 hover:bg-red-100"
                      >
                        <X className="size-3.5" />
                        {o.reject}
                      </ConfirmSubmit>
                    </form>
                  </div>
                )}

                {/* buyer decisions */}
                {activeTab === "sent" &&
                  (offer.status === "PENDING" || offer.status === "COUNTERED") && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {offer.status === "COUNTERED" && (
                        <form action={acceptCounterForm}>
                          <input type="hidden" name="offerId" value={offer.id} />
                          <ConfirmSubmit
                            confirm={o.acceptConfirm(formatSAR(offer.counterAmount ?? 0))}
                            className="act-btn bg-green-50 text-green-700 hover:bg-green-100"
                          >
                            <Check className="size-3.5" />
                            {o.acceptCounter}
                          </ConfirmSubmit>
                        </form>
                      )}
                      <form action={withdrawOfferForm}>
                        <input type="hidden" name="offerId" value={offer.id} />
                        <ConfirmSubmit
                          confirm={o.withdrawConfirm}
                          className="act-btn bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                        >
                          <RotateCcw className="size-3.5" />
                          {o.withdraw}
                        </ConfirmSubmit>
                      </form>
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
