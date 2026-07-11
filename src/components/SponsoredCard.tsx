import Link from "next/link";
import { ArrowUpLeft, Megaphone } from "lucide-react";
import type { CardListing } from "@/lib/types";
import { getT } from "@/lib/i18n";
import { formatSAR, parseImages } from "@/lib/utils";

/**
 * Google-ad-style sponsored card: the product image fills the card, a small
 * rectangular «ممول» disclosure sits on the corner, and a floating white
 * footer carries the title, price, and a circular go-to-product arrow.
 * The WHOLE card is one link to the product page, routed through
 * `?spc=<campaignId>` so the campaign's click counter is credited.
 */
export async function SponsoredCard({
  listing,
  campaignId,
}: {
  listing: CardListing;
  campaignId?: string;
}) {
  const { t } = await getT();
  const images = parseImages(listing.images);
  const cover = images[0] ?? "/images/ph/chair1.svg";
  const base = listing.auction ? `/auctions/${listing.auction.id}` : `/listings/${listing.id}`;
  const href = campaignId ? `${base}?spc=${campaignId}` : base;
  const price =
    listing.auction != null
      ? (listing.auction.bids[0]?.amount ?? null)
      : listing.price;

  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-[1.35rem] overflow-hidden bg-white ring-1 ring-primary-500/50 shadow-[0_4px_18px_-4px_rgba(219,119,89,0.35)] hover:shadow-[0_10px_28px_-6px_rgba(219,119,89,0.5)] transition-shadow h-full min-h-72"
    >
      {/* full-bleed product image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover}
        alt={listing.title}
        loading="lazy"
        className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
      />

      {/* sponsored disclosure */}
      <span className="tag absolute top-3 right-3 z-10 bg-primary-600 text-white shadow-md">
        <Megaphone className="size-3" />
        {t.home.sponsored}
      </span>

      {/* image dots (static indicator like the reference) */}
      {images.length > 1 && (
        <span className="absolute bottom-[5.5rem] inset-x-0 z-10 flex items-center justify-center gap-1.5">
          {images.slice(0, 4).map((_, i) => (
            <span
              key={i}
              className={`rounded-full ${i === 0 ? "size-2 bg-white" : "size-1.5 bg-white/55"}`}
            />
          ))}
        </span>
      )}

      {/* floating footer: title + price + go arrow */}
      <div className="relative z-10 mt-auto m-2.5 rounded-2xl bg-white/95 backdrop-blur-sm shadow-lg p-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-neutral-900 line-clamp-1">{listing.title}</p>
          <p className="font-display font-extrabold text-primary-600 mt-0.5">
            {price != null ? formatSAR(price) : t.card.negotiable}
          </p>
        </div>
        <span className="size-11 shrink-0 rounded-xl bg-neutral-900 text-white flex items-center justify-center transition-colors group-hover:bg-primary-500">
          <ArrowUpLeft className="size-5" />
        </span>
      </div>
    </Link>
  );
}
