import { PublicImage } from "@/components/PublicImage";
import Link from "next/link";
import { Gavel, MapPin } from "lucide-react";
import type { CardListing } from "@/lib/types";
import { getT } from "@/lib/i18n";
import { cn, formatSAR, parseImages } from "@/lib/utils";
import { Countdown } from "./Countdown";
import { GlassTimer } from "./GlassTimer";

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
        // phone layout: softer card corners
        "max-md:rounded-[20px]",
        className,
      )}
    >
      <div className="relative aspect-4/3 overflow-hidden bg-neutral-100">
        <PublicImage
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
        {/* phone layout: frosted countdown + buy-now flag on the photo */}
        {live && (
          <GlassTimer endsAt={auction.endsAt} className="absolute bottom-2 start-2 md:hidden" />
        )}
        {live && auction.buyNowPrice != null && (
          <span className="absolute top-2 left-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-bold text-neutral-900 backdrop-blur md:hidden">
            ⚡ {t.auctionsPage.tabBuyNow}
          </span>
        )}
      </div>

      <div className="p-4 max-md:p-3 space-y-1.5">
        <p className="md:hidden text-[11px] text-neutral-400 leading-none">
          {t.auctionsPage.currentBid}
        </p>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-neutral-900 font-bold font-display text-xl max-md:text-base max-md:whitespace-nowrap leading-tight">
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

        <div className="hidden md:flex items-center justify-between rounded-lg bg-neutral-50 border border-neutral-100 px-2.5 py-1.5 mt-1">
          <span className="text-[11px] text-neutral-400">{t.card.endsIn}</span>
          <Countdown endsAt={auction.endsAt} />
        </div>
      </div>
    </Link>
  );
}
