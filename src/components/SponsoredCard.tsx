import { PublicImage } from "@/components/PublicImage";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Camera, Gavel, MapPin, Megaphone } from "lucide-react";
import type { CardListing } from "@/lib/types";
import { getT } from "@/lib/i18n";
import { formatSAR, parseImages } from "@/lib/utils";

/**
 * Sponsored listing card. Same skeleton as ListingCard (4:3 photo + body) so
 * it lines up in any grid, but unmistakably premium: a terracotta gradient
 * frame, an explicit «إعلان ممول» disclosure, a warm body and a full-width
 * call to action. The WHOLE card is one link, routed through `?spc=<id>` so
 * the campaign's click counter is credited.
 */
export async function SponsoredCard({
  listing,
  campaignId,
}: {
  listing: CardListing;
  campaignId?: string;
}) {
  const { lang, t } = await getT();
  const images = parseImages(listing.images);
  const cover = images[0] ?? "/images/ph/chair1.svg";
  const base = listing.auction ? `/auctions/${listing.auction.id}` : `/listings/${listing.id}`;
  const href = campaignId ? `${base}?spc=${campaignId}` : base;
  const auction = listing.auction;
  const price = auction ? (auction.bids[0]?.amount ?? auction.startPrice) : listing.price;
  const category = lang === "en" ? listing.category.nameEn : listing.category.nameAr;

  return (
    <Link
      href={href}
      aria-label={`${t.card.sponsoredAd}: ${listing.title}`}
      className="group relative flex h-full flex-col bg-linear-to-br from-primary-300 via-primary-500 to-primary-700 p-[1.5px] shadow-[0_8px_24px_-10px_rgba(166,74,48,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-12px_rgba(166,74,48,0.6)]"
    >
      <div className="flex h-full flex-col overflow-hidden bg-white">
        {/* photo */}
        <div className="relative aspect-4/3 overflow-hidden bg-neutral-100">
          <PublicImage
            src={cover}
            alt={listing.title}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-black/50 to-transparent"
          />

          {/* disclosure */}
          <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 bg-neutral-950/80 px-2.5 py-1 text-[11px] font-bold text-white shadow-md backdrop-blur-sm">
            <Megaphone className="size-3.5 text-primary-300" />
            {t.card.sponsoredAd}
          </span>

          <span className="absolute bottom-2.5 right-2.5 max-w-[65%] truncate text-[11px] font-semibold text-white drop-shadow">
            {category}
          </span>
          {images.length > 1 && (
            <span className="absolute bottom-2 left-2.5 inline-flex items-center gap-1 bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
              <Camera className="size-3" aria-hidden />
              <span className="tabular-nums">{images.length}</span>
              <span className="sr-only">{t.card.photos}</span>
            </span>
          )}
        </div>

        {/* body */}
        <div className="flex flex-1 flex-col gap-1.5 bg-linear-to-b from-primary-50 to-white p-4">
          {auction && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700">
              <Gavel className="size-3.5" aria-hidden />
              {t.auctionsPage.currentBid}
            </span>
          )}
          <p className="font-display text-xl font-bold leading-tight text-primary-600">
            {price != null ? formatSAR(price) : t.card.negotiable}
          </p>
          <h3 className="flex items-center gap-1 text-[15px] font-semibold leading-snug text-neutral-900">
            {listing.seller.idVerified && (
              <BadgeCheck
                className="size-4 shrink-0 text-green-600"
                aria-label={t.card.verifiedSeller}
              />
            )}
            <span className="line-clamp-1">{listing.title}</span>
          </h3>
          <p className="inline-flex min-w-0 items-center gap-1 text-xs text-neutral-500">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{listing.city}</span>
            {!auction && (
              <>
                <span className="text-neutral-300">·</span>
                <span className="shrink-0">
                  {t.card.conditions[listing.condition] ?? listing.condition}
                </span>
              </>
            )}
          </p>

          {/* call to action */}
          <span className="mt-auto flex items-center justify-between border-t border-primary-100 pt-3 text-sm font-bold text-primary-700">
            {t.card.viewAd}
            <span className="flex size-8 items-center justify-center bg-primary-600 text-white transition-all duration-200 group-hover:bg-primary-700 rtl:group-hover:-translate-x-1 ltr:group-hover:translate-x-1">
              <ArrowLeft className="size-4 ltr:rotate-180" aria-hidden />
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}
