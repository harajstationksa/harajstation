"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useLang } from "./LangProvider";

type Banner = {
  id: string;
  title: string;
  imageUrl: string | null;
  mobileImageUrl?: string | null;
  linkUrl: string | null;
  embedHtml?: string | null;
};

export function BannerCarousel({
  banners,
  hero = false,
}: {
  banners: Banner[];
  hero?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const { lang } = useLang();

  useEffect(() => {
    if (banners.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % banners.length), 5000);
    return () => clearInterval(id);
  }, [banners.length]);

  if (banners.length === 0) return null;

  // strip slides toward inline-start: +x in RTL, -x in LTR
  const shift = index * 100 * (lang === "ar" ? 1 : -1);

  function track(id: string) {
    fetch(`/api/showcase/${id}/open`, { method: "POST" }).catch(() => {});
  }

  const aspect = hero
    ? "aspect-4/1 max-sm:aspect-2/1"
    : "aspect-4/1 max-sm:aspect-5/2";

  return (
    <div className={cn("relative overflow-hidden rounded-2xl", hero ? "shadow-lg" : "shadow-card")}>
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(${shift}%)` }}
      >
        {banners.map((b) => {
          // embed banner (AdSense / YouTube / TikTok ...)
          if (b.embedHtml) {
            return (
              <div
                key={b.id}
                className={cn("w-full shrink-0 bg-neutral-100 [&_iframe]:w-full [&_iframe]:h-full", aspect)}
                dangerouslySetInnerHTML={{ __html: b.embedHtml }}
              />
            );
          }
          const img = (
            // phones (< sm, where the frame narrows to 2:1) get the taller
            // artwork when it exists; every wider screen keeps imageUrl
            <picture>
              {b.mobileImageUrl && (
                <source media="(max-width: 639px)" srcSet={b.mobileImageUrl} />
              )}
              <img
                src={b.imageUrl ?? ""}
                alt={b.title}
                className={cn("w-full object-cover", aspect)}
              />
            </picture>
          );
          return b.linkUrl ? (
            <Link
              key={b.id}
              href={b.linkUrl}
              onClick={() => track(b.id)}
              className="w-full shrink-0"
              aria-label={b.title}
            >
              {img}
            </Link>
          ) : (
            <div key={b.id} className="w-full shrink-0">
              {img}
            </div>
          );
        })}
      </div>

      {banners.length > 1 && (
        <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-1.5">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`بانر ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all cursor-pointer",
                i === index ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
