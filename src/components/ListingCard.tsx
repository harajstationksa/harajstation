import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import type { CardListing } from "@/lib/types";
import { getT } from "@/lib/i18n";
import { formatSAR, parseImages, timeAgo } from "@/lib/utils";

export async function ListingCard({ listing }: { listing: CardListing }) {
  const { lang, t } = await getT();
  const images = parseImages(listing.images);
  const cover = images[0] ?? "/images/ph/chair1.svg";

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="card group overflow-hidden rounded-2xl transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5"
    >
      <div className="relative aspect-4/3 overflow-hidden bg-neutral-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt={listing.title}
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {listing.isFeatured && (
          <span className="tag absolute top-2.5 right-2.5 bg-neutral-900/90 text-primary-400 shadow-md backdrop-blur-sm">
            <Star className="size-3 fill-current" />
            {t.card.featured}
          </span>
        )}
      </div>

      <div className="p-4 space-y-1.5">
        <p className="text-primary-600 font-bold font-display text-xl leading-tight">
          {listing.price != null ? formatSAR(listing.price) : t.card.negotiable}
        </p>
        <h3 className="font-semibold text-[15px] text-neutral-800 line-clamp-1 leading-snug">
          {listing.title}
        </h3>
        <div className="flex items-center justify-between text-xs text-neutral-400 pt-1">
          <span className="inline-flex items-center gap-1 min-w-0">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{listing.city}</span>
            <span className="text-neutral-300">·</span>
            <span className="shrink-0">
              {t.card.conditions[listing.condition] ?? listing.condition}
            </span>
          </span>
          <span className="shrink-0" suppressHydrationWarning>
            {timeAgo(listing.createdAt, lang)}
          </span>
        </div>
      </div>
    </Link>
  );
}
