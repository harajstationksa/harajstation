import type { Metadata } from "next";

/**
 * One place for everything Google reads.
 *
 * The rule that matters most here is CANONICAL. Every filter combination is a
 * URL — /listings?city=الرياض&type=AUCTION&sort=price_asc&page=3 — and left
 * alone Google will crawl thousands of near-identical, mostly-empty pages,
 * split the ranking signal between them, and judge the site as thin. So a
 * filtered view points its canonical back at the clean page and asks not to be
 * indexed (but still to be followed, so the listings behind it are found).
 */

export const SITE = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export const BRAND = "حراج ستيشن";

/** Relative path → absolute URL. Google wants absolute in JSON-LD and OG. */
export function abs(path: string): string {
  if (!path) return SITE;
  return path.startsWith("http") ? path : `${SITE}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** The params that change *which* results are shown, not just how many pages in. */
const FILTER_PARAMS = ["q", "city", "condition", "type", "min", "max", "sort", "featured"];

export type SP = Record<string, string | string[] | undefined>;

/**
 * A filtered view is a slice of a page that already exists. It stays crawlable
 * (follow) so the listings inside it are discovered, but it must not compete
 * with the page it came from.
 */
export function isFiltered(sp: SP): boolean {
  return FILTER_PARAMS.some((k) => {
    const v = sp[k];
    return typeof v === "string" && v.length > 0;
  });
}

/**
 * Page 2 is not a duplicate of page 1 — it holds different listings — so it
 * keeps its own canonical and stays indexable. Only filters collapse.
 */
export function canonicalFor(basePath: string, sp: SP): string {
  const page = typeof sp.page === "string" ? Number(sp.page) : 1;
  return !isFiltered(sp) && page > 1 ? `${basePath}?page=${page}` : basePath;
}

export function pageMeta({
  title,
  description,
  path,
  images,
  noindex = false,
}: {
  title: string;
  description: string;
  path: string;
  images?: string[];
  noindex?: boolean;
}): Metadata {
  const ogImages = (images ?? []).filter(Boolean).map(abs);
  return {
    title,
    description,
    alternates: { canonical: path },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      url: abs(path),
      siteName: BRAND,
      locale: "ar_SA",
      type: "website",
      ...(ogImages.length ? { images: ogImages } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImages.length ? { images: ogImages } : {}),
    },
  };
}

/* ─────────────────────────── structured data ─────────────────────────── */

type Json = Record<string, unknown>;

/** Identifies the business to Google — the basis of a knowledge panel. */
export function organizationLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND,
    url: SITE,
    logo: abs("/logo.png"),
    areaServed: { "@type": "Country", name: "SA" },
  };
}

/** Lets Google put a search box for the site directly in the results page. */
export function websiteLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BRAND,
    url: SITE,
    inLanguage: "ar-SA",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE}/listings?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** Turns the crumbs we already draw into the trail Google shows under a result. */
export function breadcrumbLd(trail: { name: string; path: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: abs(c.path),
    })),
  };
}

export function itemListLd(items: { name: string; path: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: abs(it.path),
    })),
  };
}

const CONDITION_LD: Record<string, string> = {
  NEW: "https://schema.org/NewCondition",
  LIKE_NEW: "https://schema.org/RefurbishedCondition",
  USED: "https://schema.org/UsedCondition",
};

/**
 * The Product card Google can show with a price and availability. A sold item
 * must say so — claiming InStock for something already gone is exactly the kind
 * of mismatch that gets rich results revoked.
 */
export function productLd(listing: {
  id: string;
  ref?: string | null;
  title: string;
  description: string;
  images: string[];
  price: number | null;
  condition: string;
  status: string;
  city: string;
  sellerName?: string | null;
  brand?: string | null;
  path: string;
}): Json {
  const available =
    listing.status === "ACTIVE"
      ? "https://schema.org/InStock"
      : "https://schema.org/SoldOut";
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: listing.description.slice(0, 500),
    image: listing.images.map(abs),
    ...(listing.ref ? { sku: listing.ref } : {}),
    ...(listing.brand ? { brand: { "@type": "Brand", name: listing.brand } } : {}),
    itemCondition: CONDITION_LD[listing.condition] ?? CONDITION_LD.USED,
    ...(listing.price != null
      ? {
          offers: {
            "@type": "Offer",
            price: listing.price,
            priceCurrency: "SAR",
            availability: available,
            itemCondition: CONDITION_LD[listing.condition] ?? CONDITION_LD.USED,
            url: abs(listing.path),
            areaServed: listing.city,
            ...(listing.sellerName
              ? { seller: { "@type": "Person", name: listing.sellerName } }
              : {}),
          },
        }
      : {}),
  };
}

/**
 * An auction's price is whatever the bidding has reached, and the offer expires
 * when the auction closes — priceValidUntil is what tells Google the number has
 * a shelf life.
 */
export function auctionLd(a: {
  title: string;
  description: string;
  images: string[];
  currentPrice: number;
  endsAt: Date;
  status: string;
  condition: string;
  city: string;
  path: string;
}): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: a.title,
    description: a.description.slice(0, 500),
    image: a.images.map(abs),
    itemCondition: CONDITION_LD[a.condition] ?? CONDITION_LD.USED,
    offers: {
      "@type": "Offer",
      price: a.currentPrice,
      priceCurrency: "SAR",
      priceValidUntil: a.endsAt.toISOString().slice(0, 10),
      availability:
        a.status === "LIVE"
          ? "https://schema.org/InStock"
          : "https://schema.org/SoldOut",
      url: abs(a.path),
      areaServed: a.city,
    },
  };
}
