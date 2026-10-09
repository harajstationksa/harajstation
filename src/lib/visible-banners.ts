import type { Prisma } from "@prisma/client";

/** Website and phone share the same schedule and deterministic slide order. */
export function visibleBannerWhere(now: Date, position?: string): Prisma.BannerWhereInput {
  return {
    status: "ACTIVE",
    ...(position ? { position } : {}),
    OR: [{ startsAt: null }, { startsAt: { lte: now } }],
    AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
  };
}

export const bannerOrder = [
  { createdAt: "desc" },
  { id: "asc" },
] satisfies Prisma.BannerOrderByWithRelationInput[];
