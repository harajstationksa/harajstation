import type { Prisma } from "@prisma/client";

/** Parse a JSON string column, falling back on the given default. */
export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const listingCardInclude = {
  category: { select: { slug: true, nameAr: true, nameEn: true, icon: true, parent: { select: { slug: true } } } },
  seller: {
    select: {
      id: true,
      name: true,
      credibility: true,
      idVerified: true,
      avatarUrl: true,
      avatarColor: true,
      city: true,
      isPro: true,
    },
  },
  auction: {
    select: {
      id: true,
      status: true,
      endsAt: true,
      startPrice: true,
      buyNowPrice: true,
      minIncrement: true,
      bids: { orderBy: { amount: "desc" as const }, take: 1, select: { amount: true } },
      _count: { select: { bids: true } },
    },
  },
} satisfies Prisma.ListingInclude;

export type ListingWithCard = Prisma.ListingGetPayload<{
  include: typeof listingCardInclude;
}>;

/** The compact shape every listing card in the app renders from. */
export function serializeListingCard(l: ListingWithCard) {
  const images = parseJson<string[]>(l.images, []);
  return {
    id: l.id,
    ref: l.ref,
    type: l.type,
    title: l.title,
    price: l.price,
    condition: l.condition,
    city: l.city,
    neighborhood: l.neighborhood,
    images,
    image: images[0] ?? null,
    status: l.status,
    isFeatured: l.isFeatured,
    isPromoted: l.isPromoted,
    views: l.views,
    deliveryMethod: l.deliveryMethod,
    attributes: parseJson<Record<string, string>>(l.attributes, {}),
    createdAt: l.createdAt.toISOString(),
    category: {
      slug: l.category.slug,
      nameAr: l.category.nameAr,
      nameEn: l.category.nameEn,
      icon: l.category.icon,
      parentSlug: l.category.parent?.slug ?? null,
    },
    seller: {
      id: l.seller.id,
      name: l.seller.name,
      credibility: l.seller.credibility,
      idVerified: l.seller.idVerified,
      avatarUrl: l.seller.avatarUrl,
      avatarColor: l.seller.avatarColor,
      city: l.seller.city,
      isPro: l.seller.isPro,
    },
    auction: l.auction
      ? {
          id: l.auction.id,
          status: l.auction.status,
          endsAt: l.auction.endsAt.toISOString(),
          startPrice: l.auction.startPrice,
          buyNowPrice: l.auction.buyNowPrice,
          minIncrement: l.auction.minIncrement,
          currentBid: l.auction.bids[0]?.amount ?? l.auction.startPrice,
          bidCount: l.auction._count.bids,
        }
      : null,
  };
}

export function serializeUserPublic(u: {
  id: string;
  name: string;
  city: string;
  credibility: number;
  successfulTx: number;
  idVerified: boolean;
  isPro: boolean;
  avatarUrl: string | null;
  avatarColor: string;
  createdAt: Date;
}) {
  return {
    id: u.id,
    name: u.name,
    city: u.city,
    credibility: u.credibility,
    successfulTx: u.successfulTx,
    idVerified: u.idVerified,
    isPro: u.isPro,
    avatarUrl: u.avatarUrl,
    avatarColor: u.avatarColor,
    memberSince: u.createdAt.toISOString(),
  };
}
