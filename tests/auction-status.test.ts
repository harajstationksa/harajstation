/**
 * The listing row and the auction row each carry a status, and only the
 * auction one is authoritative. These cover the reconciler that pulls a
 * drifted listing back in step (a closed auction still sitting at ACTIVE —
 * what relisting an auction used to produce) and the display rule the
 * dashboard badge uses while the finalizer hasn't run yet.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { displayListingStatus, reconcileEndedAuctionListings } from "@/lib/auction";

const stamp = Date.now();
const slug = `vitest-auc-${stamp}`;
let sellerId = "";
let categoryId = "";
const listingIds: string[] = [];

/** An auction listing in an arbitrary (possibly inconsistent) pair of states. */
async function mkAuction(listingStatus: string, auctionStatus: string, endsAt: Date) {
  const listing = await db.listing.create({
    data: {
      title: "مزاد اختبار",
      description: "وصف اختبار للمزاد",
      type: "AUCTION",
      status: listingStatus,
      condition: "USED",
      city: "الرياض",
      images: "[]",
      sellerId,
      categoryId,
      auction: { create: { startPrice: 100, endsAt, status: auctionStatus } },
    },
  });
  listingIds.push(listing.id);
  return listing.id;
}

const statusOf = async (id: string) =>
  (await db.listing.findUniqueOrThrow({ where: { id } })).status;

beforeAll(async () => {
  categoryId = (
    await db.category.upsert({
      where: { slug },
      create: { slug, nameAr: "اختبار", nameEn: "Test", icon: "Box" },
      update: {},
    })
  ).id;
  sellerId = (
    await db.user.create({
      data: {
        name: `vitest auction seller`,
        phone: `+9665${String(stamp).slice(-8)}3`,
        email: `vitest-auc-${stamp}@test.local`,
        passwordHash: "x",
        city: "الرياض",
      },
    })
  ).id;
});

afterAll(async () => {
  await db.listing.deleteMany({ where: { id: { in: listingIds } } });
  await db.user.deleteMany({ where: { id: sellerId } });
  await db.category.deleteMany({ where: { slug } });
});

describe("reconcileEndedAuctionListings", () => {
  it("closes listings left ACTIVE under a finished auction", async () => {
    const past = new Date(Date.now() - 86_400_000);
    const sold = await mkAuction("ACTIVE", "ENDED", past);
    const noSale = await mkAuction("ACTIVE", "NO_SALE", past);
    const cancelled = await mkAuction("ACTIVE", "CANCELLED", past);

    await reconcileEndedAuctionListings();

    expect(await statusOf(sold)).toBe("SOLD");
    expect(await statusOf(noSale)).toBe("EXPIRED");
    expect(await statusOf(cancelled)).toBe("EXPIRED");
  });

  it("leaves a running auction and a moderated listing alone", async () => {
    const live = await mkAuction("ACTIVE", "LIVE", new Date(Date.now() + 86_400_000));
    // the hammer has fallen but the finalizer owns this row, not the reconciler
    const awaitingFinalize = await mkAuction("ACTIVE", "LIVE", new Date(Date.now() - 60_000));
    const removed = await mkAuction("REMOVED", "ENDED", new Date(Date.now() - 86_400_000));

    await reconcileEndedAuctionListings();

    expect(await statusOf(live)).toBe("ACTIVE");
    expect(await statusOf(awaitingFinalize)).toBe("ACTIVE");
    expect(await statusOf(removed)).toBe("REMOVED");
  });
});

describe("displayListingStatus", () => {
  const now = Date.now();
  const auction = (status: string, endsAt: Date) => ({ status, endsAt });

  it("follows the auction row, not the listing row", () => {
    const l = { status: "ACTIVE", type: "AUCTION" };
    const past = new Date(now - 1000);
    expect(displayListingStatus(l, auction("ENDED", past), now)).toBe("SOLD");
    expect(displayListingStatus(l, auction("NO_SALE", past), now)).toBe("EXPIRED");
    expect(displayListingStatus(l, auction("CANCELLED", past), now)).toBe("EXPIRED");
  });

  it("marks the window between the end time and the finalizer", () => {
    const l = { status: "ACTIVE", type: "AUCTION" };
    expect(displayListingStatus(l, auction("LIVE", new Date(now + 1000)), now)).toBe("ACTIVE");
    expect(displayListingStatus(l, auction("LIVE", new Date(now - 1000)), now)).toBe("ENDED");
  });

  it("keeps moderation and non-auction statuses untouched", () => {
    const past = new Date(now - 1000);
    expect(
      displayListingStatus({ status: "REMOVED", type: "AUCTION" }, auction("ENDED", past), now)
    ).toBe("REMOVED");
    expect(
      displayListingStatus({ status: "PENDING", type: "AUCTION" }, auction("ENDED", past), now)
    ).toBe("PENDING");
    expect(displayListingStatus({ status: "ACTIVE", type: "STANDARD" }, null, now)).toBe("ACTIVE");
    expect(displayListingStatus({ status: "SOLD", type: "STANDARD" }, null, now)).toBe("SOLD");
  });
});
