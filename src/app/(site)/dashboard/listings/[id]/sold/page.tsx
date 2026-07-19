import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ChevronRight, HandCoins, MessageSquare } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { formatSAR, parseImages } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { markSoldWithBuyerAction } from "../../../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.soldFlow.title };
}

/**
 * «تم البيع» with a real buyer: the seller picks who bought from the people
 * who actually engaged (chats + offers). That choice opens the same mutual
 * confirmation → credibility → reviews pipeline auctions already use — the
 * reviews that make the NEXT sale faster.
 */
export default async function MarkSoldPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { t } = await getT();
  const s = t.soldFlow;
  const { id } = await params;

  const listing = await db.listing.findUnique({
    where: { id },
    include: { auction: true },
  });
  if (!listing || listing.sellerId !== user.id) notFound();
  if (listing.status !== "ACTIVE" || (listing.auction && listing.auction.status === "LIVE")) {
    notFound();
  }

  const [convs, offers] = await Promise.all([
    db.conversation.findMany({
      where: { listingId: id },
      include: { buyer: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.offer.findMany({
      where: { listingId: id },
      include: { buyer: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  // one candidate per buyer; an accepted offer wins as the price signal
  type Candidate = {
    buyer: { id: string; name: string; avatarColor: string; avatarUrl: string | null };
    viaChat: boolean;
    offerAmount: number | null;
    offerAccepted: boolean;
  };
  const byBuyer = new Map<string, Candidate>();
  for (const c of convs) {
    byBuyer.set(c.buyerId, {
      buyer: c.buyer,
      viaChat: true,
      offerAmount: null,
      offerAccepted: false,
    });
  }
  for (const o of offers) {
    const existing = byBuyer.get(o.buyerId);
    const amount = o.status === "ACCEPTED" ? (o.counterAmount ?? o.amount) : o.amount;
    const accepted = o.status === "ACCEPTED";
    if (!existing) {
      byBuyer.set(o.buyerId, {
        buyer: o.buyer,
        viaChat: false,
        offerAmount: amount,
        offerAccepted: accepted,
      });
    } else if (accepted || existing.offerAmount == null) {
      existing.offerAmount = amount;
      existing.offerAccepted = existing.offerAccepted || accepted;
    }
  }
  const candidates = [...byBuyer.values()].sort(
    (a, b) => Number(b.offerAccepted) - Number(a.offerAccepted)
  );
  const suggestedAmount =
    candidates.find((c) => c.offerAccepted)?.offerAmount ?? listing.price ?? undefined;

  const cover = parseImages(listing.images)[0];

  return (
    <div className="space-y-5 max-w-2xl">
      <Link
        href="/dashboard/listings"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-primary-600"
      >
        <ChevronRight className="size-4" />
        {s.back}
      </Link>

      <h1 className="section-title">{s.title}</h1>

      <div className="card p-3.5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} alt="" className="size-14 rounded-lg object-cover border border-neutral-100" />
        <div className="min-w-0">
          <p className="font-semibold text-sm line-clamp-1">{listing.title}</p>
          {listing.price != null && (
            <p className="text-xs text-neutral-400 mt-0.5 tabular-nums">
              {t.offers.listedAt} {formatSAR(listing.price)}
            </p>
          )}
        </div>
      </div>

      <form action={markSoldWithBuyerAction} className="card p-5 space-y-4">
        <input type="hidden" name="listingId" value={listing.id} />

        <div>
          <p className="font-bold text-sm mb-1.5">{s.pickBuyer}</p>
          <p className="text-xs text-neutral-500 mb-3 leading-relaxed">{s.whyPick}</p>

          <div className="space-y-2">
            {candidates.map((c) => (
              <label
                key={c.buyer.id}
                className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3 cursor-pointer hover:border-primary-300 has-checked:border-primary-500 has-checked:bg-primary-50/40 transition-colors"
              >
                <input
                  type="radio"
                  name="buyerId"
                  value={c.buyer.id}
                  defaultChecked={c.offerAccepted}
                  className="size-4 accent-primary-500"
                />
                <Avatar
                  name={c.buyer.name}
                  color={c.buyer.avatarColor}
                  src={c.buyer.avatarUrl}
                  className="size-9 text-sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-sm block">{c.buyer.name}</span>
                  <span className="text-xs text-neutral-400 flex items-center gap-2 mt-0.5">
                    {c.viaChat && (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="size-3" />
                        {s.viaChat}
                      </span>
                    )}
                    {c.offerAmount != null && (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <HandCoins className="size-3" />
                        {c.offerAccepted ? s.acceptedOffer : s.offered}{" "}
                        {formatSAR(c.offerAmount)}
                      </span>
                    )}
                  </span>
                </span>
                {c.offerAccepted && (
                  <span className="badge bg-green-50 text-green-700 shrink-0">
                    <BadgeCheck className="size-3" />
                    {s.agreed}
                  </span>
                )}
              </label>
            ))}

            <label className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3 cursor-pointer hover:border-neutral-300 has-checked:border-neutral-500 has-checked:bg-neutral-50 transition-colors">
              <input
                type="radio"
                name="buyerId"
                value=""
                defaultChecked={candidates.every((c) => !c.offerAccepted)}
                className="size-4 accent-neutral-600"
              />
              <span className="min-w-0">
                <span className="font-semibold text-sm block">{s.outside}</span>
                <span className="text-xs text-neutral-400">{s.outsideHint}</span>
              </span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            {s.amountL} <span className="text-neutral-400 font-normal">{s.amountHint}</span>
          </label>
          <input
            name="amount"
            className="input"
            inputMode="numeric"
            pattern="\d*"
            defaultValue={suggestedAmount}
          />
        </div>

        <button className="btn-primary w-full">{s.confirmBtn}</button>
        <p className="text-[11px] text-neutral-400 leading-relaxed">{s.note}</p>
      </form>
    </div>
  );
}
