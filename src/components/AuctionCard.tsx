import Link from "next/link";
import { Gavel, MapPin } from "lucide-react";
import type { CardListing } from "@/lib/types";
import { getT } from "@/lib/i18n";
import { cn, formatSAR, parseImages } from "@/lib/utils";
import { Countdown } from "./Countdown";

export async function AuctionCard({
  listing,
  className,
}: {
  listing: CardListing;
  className?: string;
}) {
  const { t } = await getT();
  const auction = listing.auction;
  if (!auction) return null;
  const images = parseImages(listing.images);
  const cover = images[0] ?? "/images/ph/chair1.svg";
  const currentBid = auction.bids[0]?.amount ?? auction.startPrice;
  const bidCount = auction._count.bids;
  const live = auction.status === "LIVE" && new Date(auction.endsAt) > new Date();

  return (
    <Link
      href={`/auctions/${auction.id}`}
      className={cn(
        "group overflow-hidden bg-white border border-neutral-100 shadow-card transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5",
        className
      )}
    >
      <div className="relative aspect-4/3 overflow-hidden bg-neutral-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt={listing.title}
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {live ? (
          <span className="badge absolute top-2 right-2 bg-red-600 text-white shadow-sm">
            <span className="size-1.5 rounded-full bg-white animate-live-pulse" />
            {t.card.live}
          </span>
        ) : (
          <span className="badge absolute top-2 right-2 bg-neutral-800/90 text-white">
            {t.card.ended}
          </span>
        )}
      </div>

      <div className="p-4 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-neutral-900 font-bold font-display text-xl leading-tight">
            {formatSAR(currentBid)}
          </p>
          <span className="chip shrink-0">
            <Gavel className="size-3" />
            {bidCount}
          </span>
        </div>
        <h3 className="font-semibold text-[15px] text-neutral-800 line-clamp-1 leading-snug">
          {listing.title}
        </h3>

        <div className="flex items-center justify-between text-xs text-neutral-400 pt-0.5">
          <span className="inline-flex items-center gap-1 min-w-0">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{listing.city}</span>
          </span>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-neutral-50 border border-neutral-100 px-2.5 py-1.5 mt-1">
          <span className="text-[11px] text-neutral-400">{t.card.endsIn}</span>
          <Countdown endsAt={auction.endsAt} />
        </div>
      </div>
    </Link>
  );
}
