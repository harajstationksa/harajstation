import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const state = vi.hoisted(() => ({
  actor: "",
  failNotice: false,
  urls: ["/uploads/stores/22222222-2222-4222-8222-222222222222.webp"],
}));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  getSession: async () => ({ sub: state.actor, name: "Atomic audit", role: "USER" }),
  getCurrentUser: async () =>
    (await import("@/lib/db")).db.user.findUnique({ where: { id: state.actor } }),
}));
vi.mock("@/lib/uploads", () => ({
  MAX_FILE: 5242880,
  saveImages: async () => ({ ok: true, urls: state.urls }),
  deleteImages: async () => {},
}));
vi.mock("@/lib/notify", async (original) => {
  const real = await original<typeof import("@/lib/notify")>();
  return {
    ...real,
    notifyWithClient: async (...args: Parameters<typeof real.notifyWithClient>) => {
      if (state.failNotice) throw Error("SIMULATED_NOTIFICATION_WRITE_FAILURE");
      return real.notifyWithClient(...args);
    },
  };
});
import { db } from "@/lib/db";
import { POST as upload, DELETE as removeImage } from "@/app/api/store/images/route";
import { POST as bid } from "@/app/api/auctions/[id]/bids/route";
const prefix = "atomic-oct-" + randomUUID().slice(0, 8);
let categoryId = "",
  storeId = "",
  listingId = "",
  auctionId = "";
const users = [prefix + "-buyer", prefix + "-seller"];
beforeAll(async () => {
  categoryId = (
    await db.category.create({
      data: { slug: prefix, nameAr: prefix, nameEn: prefix, icon: "Box" },
    })
  ).id;
  await db.user.createMany({
    data: users.map((id) => ({
      id,
      name: "Atomic audit",
      email: id + "@example.invalid",
      passwordHash: "test",
      city: "الرياض",
    })),
  });
  storeId = (
    await db.store.create({
      data: {
        userId: users[0],
        name: "Atomic audit store",
        slug: prefix,
        logoUrl: "/uploads/stores/11111111-1111-4111-8111-111111111111.webp",
      },
    })
  ).id;
  listingId = (
    await db.listing.create({
      data: {
        sellerId: users[1],
        categoryId,
        title: "Atomic audit auction",
        description: "Local atomicity regression fixture",
        city: "الرياض",
        type: "AUCTION",
      },
    })
  ).id;
  auctionId = (
    await db.auction.create({
      data: {
        listingId,
        startPrice: 100,
        buyNowPrice: 1000,
        endsAt: new Date(Date.now() + 3600000),
      },
    })
  ).id;
  await db.proxyBid.create({ data: { auctionId, bidderId: users[0], maxAmount: 500 } });
});
beforeEach(() => {
  state.actor = users[0];
  state.failNotice = false;
});
afterAll(async () => {
  await db.backgroundJob.deleteMany({
    where: {
      OR: [
        { payload: { contains: prefix } },
        {
          dedupKey: {
            in: [
              "public-image-cleanup:/uploads/stores/11111111-1111-4111-8111-111111111111.webp",
              "public-image-cleanup:" + state.urls[0],
            ],
          },
        },
      ],
    },
  });
  await db.transaction.deleteMany({ where: { listingId } });
  await db.listing.deleteMany({ where: { id: listingId } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.category.deleteMany({ where: { id: categoryId } });
});
it("Store image replacement queues one durable cleanup job; DELETE queues the removed image too", async () => {
  const fd = new FormData();
  fd.set("storeId", storeId);
  fd.set("kind", "logo");
  fd.set("image", new File([new Uint8Array([1])], "test.png", { type: "image/png" }));
  expect(
    (await upload(new Request("http://localhost/api/store/images", { method: "POST", body: fd })))
      .status,
  ).toBe(200);
  expect(
    await db.backgroundJob.count({
      where: {
        dedupKey: "public-image-cleanup:/uploads/stores/11111111-1111-4111-8111-111111111111.webp",
      },
    }),
  ).toBe(1);
  expect(
    (
      await removeImage(
        new Request(`http://localhost/api/store/images?id=${storeId}&kind=logo`, {
          method: "DELETE",
        }),
      )
    ).status,
  ).toBe(200);
  expect((await db.store.findUniqueOrThrow({ where: { id: storeId } })).logoUrl).toBeNull();
  expect(
    await db.backgroundJob.count({
      where: { dedupKey: "public-image-cleanup:" + state.urls[0], status: "PENDING" },
    }),
  ).toBe(1);
});
function request(amount: number) {
  return new Request("http://localhost/api/bid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
}
it("Notification failure rolls back buy-now bid, sale, transaction and proxy deletion", async () => {
  state.failNotice = true;
  await expect(bid(request(1000), { params: Promise.resolve({ id: auctionId }) })).rejects.toThrow(
    "SIMULATED_NOTIFICATION_WRITE_FAILURE",
  );
  expect(await db.bid.count({ where: { auctionId } })).toBe(0);
  expect(await db.transaction.count({ where: { auctionId } })).toBe(0);
  expect((await db.auction.findUniqueOrThrow({ where: { id: auctionId } })).status).toBe("LIVE");
  expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe("ACTIVE");
  expect(await db.proxyBid.count({ where: { auctionId } })).toBe(1);
});
it("Successful buy-now commits the bid, transaction and durable notices together", async () => {
  expect((await bid(request(1000), { params: Promise.resolve({ id: auctionId }) })).status).toBe(
    200,
  );
  expect(await db.transaction.count({ where: { auctionId } })).toBe(1);
  expect(await db.proxyBid.count({ where: { auctionId } })).toBe(0);
  expect(
    await db.notification.count({
      where: { userId: { in: users }, type: { in: ["SOLD", "WON"] } },
    }),
  ).toBe(2);
});
