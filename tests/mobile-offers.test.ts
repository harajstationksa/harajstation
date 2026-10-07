import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "actor" } as { id: string } | null,
  findMany: vi.fn(),
  count: vi.fn(),
  actions: {
    makeOfferAction: vi.fn(),
    acceptOfferAction: vi.fn(),
    rejectOfferAction: vi.fn(),
    counterOfferAction: vi.fn(),
    acceptCounterAction: vi.fn(),
    withdrawOfferAction: vi.fn(),
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/db", () => ({ db: { offer: { findMany: mocks.findMany, count: mocks.count } } }));
vi.mock("@/app/(site)/dashboard/offers/actions", () => mocks.actions);
import { GET, POST } from "@/app/api/mobile/me/offers/route";

const request = (body: unknown) =>
  new Request("https://harajstation.com/api/mobile/me/offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.user = { id: "actor" };
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
  for (const action of Object.values(mocks.actions)) action.mockResolvedValue({ ok: true });
});

describe("mobile offers privacy and pagination", () => {
  it("requires a session before querying or executing a mutation", async () => {
    mocks.user = null;
    expect((await GET(new Request("https://harajstation.com/api/mobile/me/offers"))).status).toBe(
      401,
    );
    expect(
      (await POST(request({ action: "make", listingId: "listing", amount: 500 }))).status,
    ).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.actions.makeOfferAction).not.toHaveBeenCalled();
  });

  it.each(["received", "sent"])(
    "scopes %s offers to the signed-in user despite supplied user IDs",
    async (tab) => {
      const response = await GET(
        new Request(
          `https://harajstation.com/api/mobile/me/offers?tab=${tab}&buyerId=other&listingId=listing&page=2`,
        ),
      );
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      const where =
        tab === "sent"
          ? { buyerId: "actor", listingId: "listing" }
          : { listing: { sellerId: "actor" }, listingId: "listing" };
      expect(mocks.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where, take: 25, skip: 25 }),
      );
      expect(mocks.count).toHaveBeenCalledWith({ where });
    },
  );

  it.each(["-1", "0", "1.5", "10001", "9999999999999999999"])(
    "rejects unsafe page %s",
    async (page) => {
      const response = await GET(
        new Request(`https://harajstation.com/api/mobile/me/offers?page=${page}`),
      );
      expect(response.status).toBe(400);
      expect(mocks.findMany).not.toHaveBeenCalled();
    },
  );

  it("serializes listing images and timestamps for Flutter without leaking extra buyer fields", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "offer",
        amount: 500,
        counterAmount: null,
        status: "PENDING",
        note: "عرضي",
        createdAt: new Date("2026-10-03T12:00:00Z"),
        decidedAt: null,
        buyer: { id: "buyer", name: "المشتري" },
        listing: {
          id: "listing",
          title: "إعلان",
          images: '["/image.webp"]',
          price: 600,
          status: "ACTIVE",
          sellerId: "actor",
        },
      },
    ]);
    mocks.count.mockResolvedValue(26);
    const response = await GET(new Request("https://harajstation.com/api/mobile/me/offers"));
    expect(await response.json()).toMatchObject({
      hasMore: true,
      total: 26,
      items: [
        {
          createdAt: "2026-10-03T12:00:00.000Z",
          decidedAt: null,
          listing: { images: ["/image.webp"] },
        },
      ],
    });
    expect(mocks.findMany.mock.calls[0][0].include.buyer.select).toEqual({ id: true, name: true });
  });
});

describe("mobile actions use the same website rules", () => {
  const actions = [
    [{ action: "make", listingId: "listing", amount: 500, note: "عرضي" }, "makeOfferAction"],
    [{ action: "accept", offerId: "offer" }, "acceptOfferAction"],
    [{ action: "reject", offerId: "offer" }, "rejectOfferAction"],
    [{ action: "counter", offerId: "offer", counterAmount: 600 }, "counterOfferAction"],
    [{ action: "acceptCounter", offerId: "offer" }, "acceptCounterAction"],
    [{ action: "withdraw", offerId: "offer" }, "withdrawOfferAction"],
  ] as const;
  it.each(actions)("dispatches %j through %s", async (body, name) => {
    expect((await POST(request({ ...body, buyerId: "other", sellerId: "other" }))).status).toBe(
      200,
    );
    const form = mocks.actions[name].mock.calls[0][0] as FormData;
    for (const [key, value] of Object.entries(body)) {
      if (key !== "action") expect(form.get(key)).toBe(String(value));
    }
    expect(form.has("buyerId")).toBe(false);
    expect(form.has("sellerId")).toBe(false);
    expect(Object.values(mocks.actions).filter((action) => action.mock.calls.length)).toHaveLength(
      1,
    );
  });

  it.each([0, -1, 1.5, 100000001, "500", null])(
    "rejects invalid amount %s before invoking site logic",
    async (amount) => {
      expect((await POST(request({ action: "make", listingId: "listing", amount }))).status).toBe(
        400,
      );
      expect(mocks.actions.makeOfferAction).not.toHaveBeenCalled();
    },
  );

  it("rejects missing counter prices, unknown actions and malformed JSON", async () => {
    expect((await POST(request({ action: "counter", offerId: "offer" }))).status).toBe(400);
    expect((await POST(request({ action: "delete", offerId: "offer" }))).status).toBe(400);
    expect(
      (
        await POST(
          new Request("https://harajstation.com/api/mobile/me/offers", {
            method: "POST",
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("returns a stale or unauthorized offer error without claiming success", async () => {
    mocks.actions.acceptOfferAction.mockResolvedValue({ error: "غير مسموح" });
    const response = await POST(request({ action: "accept", offerId: "other-offer" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "غير مسموح" });
  });
});
