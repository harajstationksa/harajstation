import type { Auction, Category, Listing, User } from "@prisma/client";

/** Shape used by ListingCard / AuctionCard across the app */
export type CardListing = Listing & {
  seller: User;
  category: Category;
  auction:
    | (Auction & {
        bids: { amount: number }[];
        _count: { bids: number };
      })
    | null;
};

/** Standard include fragment matching CardListing */
export const cardInclude = {
  seller: true,
  category: true,
  auction: {
    include: {
      _count: { select: { bids: true } },
      bids: { orderBy: { amount: "desc" as const }, take: 1, select: { amount: true } },
    },
  },
} as const;
