import { PublicImage } from "@/components/PublicImage";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Camera, Gavel, MapPin, Sparkles } from "lucide-react";
import type { CardListing } from "@/lib/types";
import { getT } from "@/lib/i18n";
import { formatSAR, parseImages } from "@/lib/utils";

/**
 * Sponsored listing card — built to stand out from the regular grid: soft
 * rounded corners, a glowing terracotta-to-amber frame, the product photo
 * filling the whole card, and the details set in white over a deep gradient.
 * A light sweep runs across on hover. The WHOLE card is one link, routed
 * through `?spc=<id>` so the campaign's click counter is credited.
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
      className="group relative block h-full min-h-72 rounded-[1.6rem] bg-linear-to-br from-amber-300 via-primary-500 to-primary-700 p-[2px] shadow-[0_10px_30px_-12px_rgba(219,119,89,0.7)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_44px_-14px_rgba(219,119,89,0.85)] sm:min-h-80"
    >
      <div className="relative isolate flex h-full flex-col overflow-hidden rounded-[1.5rem] bg-neutral-900">
        {/* full-bleed photo */}
        <PublicImage
          src={cover}
          alt={listing.title}
          loading="lazy"
          className="absolute inset-0 -z-10 size-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
        />
        {/* depth: dark at the bottom for the text, light vignette at the top */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-t from-black/90 via-black/35 to-black/10"
        />
        {/* hover light sweep */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-linear-to-r from-transparent via-white/25 to-transparent opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100"
        />

        {/* top row: disclosure + photo count */}
        <div className="flex items-start justify-between gap-2 p-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-linear-to-l from-amber-400 to-primary-500 px-3 py-1 text-[11px] font-bold text-white shadow-lg shadow-primary-900/30 ring-1 ring-white/40">
            <Sparkles className="size-3.5" aria-hidden />
            {t.card.sponsoredAd}
          </span>
          {images.length > 1 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/20 backdrop-blur-md">
              <Camera className="size-3" aria-hidden />
              <span className="tabular-nums">{images.length}</span>
              <span className="sr-only">{t.card.photos}</span>
            </span>
          )}
        </div>

        {/* details over the photo */}
        <div className="mt-auto space-y-2 p-3.5 sm:p-4">
          <span className="inline-block max-w-full truncate rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white/95 ring-1 ring-white/25 backdrop-blur-md">
            {category}
          </span>
          <h3 className="flex items-start gap-1 text-[15px] font-bold leading-snug text-white sm:text-base">
            {listing.seller.idVerified && (
              <BadgeCheck
                className="mt-0.5 size-4 shrink-0 text-emerald-400"
                aria-label={t.card.verifiedSeller}
              />
            )}
            <span className="line-clamp-2">{listing.title}</span>
          </h3>
          <p className="inline-flex items-center gap-1 text-xs text-white/70">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{listing.city}</span>
          </p>

          <div className="flex items-end justify-between gap-2 pt-1">
            <div className="min-w-0">
              {auction && (
                <p className="mb-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300">
                  <Gavel className="size-3.5" aria-hidden />
                  {t.auctionsPage.currentBid}
                </p>
              )}
              <p className="font-display whitespace-nowrap text-lg font-extrabold leading-none text-white drop-shadow sm:text-2xl">
                {price != null ? formatSAR(price) : t.card.negotiable}
              </p>
            </div>
            <span
              className="grid size-9 shrink-0 place-items-center rounded-full sm:size-10 bg-white text-primary-600 shadow-lg transition-all duration-300 group-hover:bg-primary-500 group-hover:text-white rtl:group-hover:-translate-x-1 ltr:group-hover:translate-x-1"
              title={t.card.viewAd}
            >
              <ArrowLeft className="size-4.5 ltr:rotate-180 sm:size-5" aria-hidden />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
