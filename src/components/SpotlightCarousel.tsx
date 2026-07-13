"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Flame, Gavel, Megaphone } from "lucide-react";
import { cn, formatSAR } from "@/lib/utils";
import { Countdown } from "./Countdown";
import { useLang } from "./LangProvider";

const INTERVAL_MS = 6000; // keep in sync with --animate-spot-progress duration

export type SpotlightItem = {
  auctionId: string;
  title: string;
  cover: string;
  bid: number;
  bidCount: number;
  endsAt: string; // ISO
  campaignId?: string; // set → sponsored placement, click routed through ?spc=
};

/**
 * Hero spotlight: auto-rotates between the sponsored live auctions with a
 * crossfade + slow Ken-Burns zoom, story-style progress bars (clickable),
 * and pause-on-hover. A single item renders as a static card.
 */
export function SpotlightCarousel({ items }: { items: SpotlightItem[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length < 2) return;
    const id = setInterval(() => setActive((i) => (i + 1) % items.length), INTERVAL_MS);
    return () => clearInterval(id);
    // restarting on `active` keeps the timer aligned with manual jumps
  }, [paused, active, items.length]);

  const { t } = useLang();
  if (items.length === 0) return null;

  return (
    <div
      className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl shadow-black/40"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* slides (stacked, crossfading) */}
      <div className="relative aspect-16/10">
        {items.map((it, i) => {
          const isActive = i === active;
          return (
            <Link
              key={it.auctionId}
              href={`/auctions/${it.auctionId}${it.campaignId ? `?spc=${it.campaignId}` : ""}`}
              aria-hidden={!isActive}
              tabIndex={isActive ? 0 : -1}
              className={cn(
                "group absolute inset-0 block transition-opacity duration-700 ease-out",
                isActive ? "opacity-100 z-10" : "opacity-0 pointer-events-none"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.cover}
                alt={it.title}
                className={cn(
                  "size-full object-cover ease-linear",
                  // slow Ken-Burns zoom over the slide's screen time
                  isActive ? "scale-105 duration-[6000ms] transition-transform" : "scale-100"
                )}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />

              {/* badges (below the progress bars) */}
              <span className="tag absolute top-6 start-3.5 bg-red-600 text-white">
                <span className="size-1.5 rounded-full bg-white animate-live-pulse" />
                {t.card.live}
              </span>
              {it.campaignId ? (
                <span className="tag absolute top-6 end-3.5 bg-primary-600 text-white shadow-md">
                  <Megaphone className="size-3" />
                  {t.home.sponsored}
                </span>
              ) : (
                <span className="tag absolute top-6 end-3.5 bg-white/15 text-white backdrop-blur-sm">
                  <Flame className="size-3.5" />
                  {t.auctionsPage.spotlightTag}
                </span>
              )}

              {/* bottom sheet: title / bid / countdown / CTA */}
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 space-y-3 text-white">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-bold text-lg sm:text-xl line-clamp-1 flex-1">
                    {it.title}
                  </h3>
                  <span className="chip bg-white/15 text-white shrink-0">
                    <Gavel className="size-3" />
                    {it.bidCount} {t.auctionsPage.bidsUnit}
                  </span>
                </div>
                <div className="flex items-end justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-[11px] text-white/60 mb-0.5">{t.auctionsPage.currentBid}</p>
                    <p className="font-display font-extrabold text-2xl sm:text-3xl text-primary-300">
                      {formatSAR(it.bid)}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-[11px] text-white/60 mb-1">{t.auctionsPage.timeLeft}</p>
                    <span className="inline-flex rounded-lg bg-white px-3 py-1.5 shadow-sm">
                      <Countdown endsAt={it.endsAt} />
                    </span>
                  </div>
                </div>
                <span className="btn-primary w-full !min-h-10 pointer-events-none">
                  {t.auctionsPage.bidNow}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* story-style progress bars — clickable to jump */}
      {items.length > 1 && (
        <div className="absolute top-2.5 inset-x-3.5 z-20 flex gap-1.5">
          {items.map((it, i) => (
            <button
              key={it.auctionId}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`${i + 1} / ${items.length}`}
              className="flex-1 py-1.5 cursor-pointer group/bar"
            >
              <span className="block h-1 rounded-full bg-white/25 overflow-hidden transition-colors group-hover/bar:bg-white/40">
                {i === active ? (
                  <span
                    key={active} // restart the fill on every slide change
                    className="block h-full bg-white animate-spot-progress"
                    style={{ animationPlayState: paused ? "paused" : "running" }}
                  />
                ) : (
                  <span
                    className={cn("block h-full bg-white transition-all", i < active ? "w-full" : "w-0")}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
