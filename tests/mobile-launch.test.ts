import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "seller" } as { id: string } | null,
  db: {
    deviceToken: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    listing: { findMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
  },
  sale: { saleCandidates: vi.fn(), markSoldWithBuyer: vi.fn() },
  google: { googleMobileConfigured: vi.fn(), verifyMobileIdToken: vi.fn() },
  account: { resolveGoogleUser: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mocks.user,
  SESSION_COOKIE: "samel_session",
  sessionCookieOptions: { httpOnly: true, path: "/" },
  signSessionToken: async () => "signed-session",
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitGuard: async () => null }));
vi.mock("@/lib/sale", () => mocks.sale);
vi.mock("@/lib/google-oauth", () => mocks.google);
vi.mock("@/lib/google-account", () => mocks.account);
vi.mock("@/lib/email", () => ({ emailConfigured: () => false }));
vi.mock("@/app/api/mobile/_lib/serialize", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  serializeListingCard: (l: { id: string }) => ({ id: l.id }),
}));
vi.mock("@/lib/login-otp", () => ({
  maskEmail: (e: string) => e,
  startOtpChallenge: vi.fn(),
}));

import * as pushRoute from "@/app/api/mobile/push/register/route";
import * as soldRoute from "@/app/api/mobile/me/listings/[id]/sold/route";
import * as googleRoute from "@/app/api/mobile/auth/google/route";
import * as auctionsRoute from "@/app/api/mobile/auctions/route";
import { GET as assetLinks } from "@/app/.well-known/assetlinks.json/route";

const json = (url: string, method: string, body: unknown) =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: "listing-1" }) };
const TOKEN = "f".repeat(40);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: "seller" };
  mocks.db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.db));
  mocks.db.deviceToken.findMany.mockResolvedValue([]);
});

describe("native push registration", () => {
  it("requires a session", async () => {
    mocks.user = null;
    const res = await pushRoute.POST(
      json("https://x/api/mobile/push/register", "POST", { token: TOKEN }),
    );
    expect(res.status).toBe(401);
    expect(mocks.db.deviceToken.upsert).not.toHaveBeenCalled();
  });

  it("moves a device token to whoever signed in on it last", async () => {
    const res = await pushRoute.POST(
      json("https://x/api/mobile/push/register", "POST", { token: TOKEN, platform: "ANDROID" }),
    );
    expect(res.status).toBe(200);
    expect(mocks.db.deviceToken.upsert).toHaveBeenCalledWith({
      where: { token: TOKEN },
      create: { userId: "seller", token: TOKEN, platform: "ANDROID" },
      update: { userId: "seller", platform: "ANDROID" },
    });
  });

  it("only removes the caller's own token on sign-out", async () => {
    await pushRoute.DELETE(json("https://x/api/mobile/push/register", "DELETE", { token: TOKEN }));
    expect(mocks.db.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: TOKEN, userId: "seller" },
    });
  });

  it("rejects malformed tokens", async () => {
    const res = await pushRoute.POST(
      json("https://x/api/mobile/push/register", "POST", { token: "x" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("mobile mark-sold with buyer", () => {
  it("lists candidates only for the owner's eligible listing", async () => {
    mocks.sale.saleCandidates.mockResolvedValueOnce(null);
    expect((await soldRoute.GET(new Request("https://x"), ctx)).status).toBe(404);

    mocks.sale.saleCandidates.mockResolvedValueOnce({
      listing: { id: "listing-1", title: "آيفون", price: 3000, images: '["/a.jpg"]' },
      candidates: [
        {
          buyer: { id: "b1", name: "سعد", avatarColor: "#000", avatarUrl: null },
          viaChat: true,
          offerAmount: 2800,
          offerAccepted: true,
        },
      ],
      suggestedAmount: 2800,
    });
    const res = await soldRoute.GET(new Request("https://x"), ctx);
    const body = await res.json();
    expect(mocks.sale.saleCandidates).toHaveBeenLastCalledWith("seller", "listing-1");
    expect(body.listing.image).toBe("/a.jpg");
    expect(body.candidates[0].buyer.id).toBe("b1");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("opens the confirmation deal through the shared sale rules", async () => {
    mocks.sale.markSoldWithBuyer.mockResolvedValue({ ok: true, txCreated: true });
    const res = await soldRoute.POST(
      json("https://x", "POST", { buyerId: "b1", amount: 2800 }),
      ctx,
    );
    expect(await res.json()).toEqual({ ok: true, transactionCreated: true });
    expect(mocks.sale.markSoldWithBuyer).toHaveBeenCalledWith("seller", "listing-1", "b1", 2800);
  });

  it("answers 409 when the listing is not eligible", async () => {
    mocks.sale.markSoldWithBuyer.mockResolvedValue({ ok: false });
    const res = await soldRoute.POST(json("https://x", "POST", {}), ctx);
    expect(res.status).toBe(409);
  });
});

describe("native Google sign-in", () => {
  it("is unavailable until mobile client IDs are configured", async () => {
    mocks.google.googleMobileConfigured.mockReturnValue(false);
    const res = await googleRoute.POST(json("https://x", "POST", { idToken: "t".repeat(40) }));
    expect(res.status).toBe(503);
  });

  it("rejects tokens Google did not sign for our app", async () => {
    mocks.google.googleMobileConfigured.mockReturnValue(true);
    mocks.google.verifyMobileIdToken.mockResolvedValue(null);
    const res = await googleRoute.POST(json("https://x", "POST", { idToken: "t".repeat(40) }));
    expect(res.status).toBe(401);
    expect(mocks.account.resolveGoogleUser).not.toHaveBeenCalled();
  });

  it("refuses accounts the shared rules refuse", async () => {
    mocks.google.googleMobileConfigured.mockReturnValue(true);
    mocks.google.verifyMobileIdToken.mockResolvedValue({
      sub: "g",
      email: "a@b.c",
      emailVerified: true,
      name: "A",
    });
    mocks.account.resolveGoogleUser.mockResolvedValue({ ok: false, reason: "banned" });
    const res = await googleRoute.POST(json("https://x", "POST", { idToken: "t".repeat(40) }));
    expect(res.status).toBe(403);
  });

  it("starts a session like password login", async () => {
    mocks.google.googleMobileConfigured.mockReturnValue(true);
    mocks.google.verifyMobileIdToken.mockResolvedValue({
      sub: "g",
      email: "a@b.c",
      emailVerified: true,
      name: "A",
    });
    mocks.account.resolveGoogleUser.mockResolvedValue({
      ok: true,
      user: { id: "u1", role: "USER", name: "A", sessionVersion: 0, twoFactorEmail: false },
    });
    const res = await googleRoute.POST(json("https://x", "POST", { idToken: "t".repeat(40) }));
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("set-cookie")).toContain("samel_session=signed-session");
  });
});

describe("server-side auction filters", () => {
  const cohort = [
    {
      id: "a",
      auction: {
        startPrice: 100,
        endsAt: new Date(3000),
        bids: [{ amount: 900 }],
        _count: { bids: 5 },
      },
    },
    {
      id: "b",
      auction: { startPrice: 400, endsAt: new Date(1000), bids: [], _count: { bids: 0 } },
    },
    {
      id: "c",
      auction: {
        startPrice: 50,
        endsAt: new Date(2000),
        bids: [{ amount: 200 }],
        _count: { bids: 2 },
      },
    },
  ];

  it("ranks by current bid and filters the price range before paging", async () => {
    mocks.db.listing.findMany
      .mockResolvedValueOnce(cohort)
      .mockImplementationOnce(async ({ where }: { where: { id: { in: string[] } } }) =>
        // full cards come back unordered — the route restores the ranking
        [...where.id.in].reverse().map((id) => ({ id })),
      );
    const res = await auctionsRoute.GET(
      new Request("https://x/api/mobile/auctions?sort=priceHigh&min=150&page=1"),
    );
    const body = await res.json();
    expect(body.serverFilters).toBe(true);
    expect(body.total).toBe(3);
    expect(mocks.db.listing.findMany.mock.calls[1][0].where.id.in).toEqual(["a", "b", "c"]);
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["a", "b", "c"]);
  }, 10_000);

  it("pushes search, bids and outcome into the database query", async () => {
    mocks.db.listing.count.mockResolvedValue(0);
    mocks.db.listing.findMany.mockResolvedValue([]);
    await auctionsRoute.GET(
      new Request(
        "https://x/api/mobile/auctions?status=ENDED&outcome=NO_SALE&withBids=1&q=%D8%A2%D9%8A%D9%81%D9%88%D9%86",
      ),
    );
    const where = mocks.db.listing.count.mock.calls[0][0].where;
    expect(where.auction).toEqual({ status: "NO_SALE", bids: { some: {} } });
    expect(where.AND).toEqual([{ searchText: { contains: "ايفون" } }]);
  });
});

describe("Android App Links", () => {
  it("publishes only well-formed certificate fingerprints", async () => {
    const good = Array.from({ length: 32 }, () => "AB").join(":");
    vi.stubEnv("ANDROID_CERT_SHA256", `${good},not-a-fingerprint`);
    const body = await assetLinks().json();
    expect(body[0].target.sha256_cert_fingerprints).toEqual([good]);
    vi.stubEnv("ANDROID_CERT_SHA256", "");
    expect(await assetLinks().json()).toEqual([]);
    vi.unstubAllEnvs();
  });
});
