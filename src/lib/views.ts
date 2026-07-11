import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { db } from "./db";

/** Visitor key from request headers (server component context). */
async function keyFromHeaders(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local";
  const ua = (h.get("user-agent") ?? "").slice(0, 40);
  return createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 32);
}

/**
 * Count a view only for a NEW unique visitor of this listing. Reloads from the
 * same IP/UA are ignored. On a genuinely new view, if the listing has an active
 * promotion campaign, credit one delivered visitor — a results stat for the
 * campaign owner. Campaigns are day-based and end by date (lib/campaigns.ts),
 * never by visitor count.
 */
export async function recordListingView(listingId: string): Promise<void> {
  const visitorKey = await keyFromHeaders();

  // Atomic "insert if absent": unique(listingId, visitorKey) makes a duplicate
  // a no-op, so we never double count.
  const existing = await db.listingView.findUnique({
    where: { listingId_visitorKey: { listingId, visitorKey } },
  });
  if (existing) return;

  try {
    await db.listingView.create({ data: { listingId, visitorKey } });
  } catch {
    return; // raced with another request — already counted
  }

  await db.listing.update({
    where: { id: listingId },
    data: { views: { increment: 1 } },
  });

  // campaign delivery stat
  await db.campaign.updateMany({
    where: { listingId, status: "ACTIVE" },
    data: { delivered: { increment: 1 } },
  });
}
