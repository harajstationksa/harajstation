import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { hashSync } from "bcryptjs";
import { randomBytes } from "node:crypto";
const state = vi.hoisted(() => ({
  actor: "",
  cookie: "",
  mail: true,
  avatarDeletes: [] as string[],
  avatarUrl: "/uploads/avatars/11111111-1111-4111-8111-111111111111.webp",
  codes: [] as string[],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "samel_session" ? { value: state.cookie } : undefined),
    delete: vi.fn(),
    set: vi.fn(),
  }),
}));
vi.mock("@/lib/email", () => ({
  emailConfigured: () => state.mail,
  sendEmail: async () => true,
  sendLoginCodeEmail: async (_email: string, code: string) => {
    state.codes.push(code);
    return true;
  },
  sendPasswordResetEmail: async () => true,
}));
vi.mock("@/lib/email-verify", () => ({
  issueEmailVerification: async () => true,
}));
vi.mock("@/lib/uploads", () => ({
  savePrivateImage: async () => ({
    ok: true,
    path: "audit-local-virtual/identity.webp",
  }),
  deletePrivateImage: async () => {},
  saveImages: async () => ({ ok: true, urls: [state.avatarUrl] }),
  deleteImages: async (urls: string[]) => {
    state.avatarDeletes.push(...urls);
  },
  MAX_FILE: 5 * 1024 * 1024,
}));
vi.mock("@/lib/auth", async (original) => {
  const real = await original<typeof import("@/lib/auth")>();
  return {
    ...real,
    getCurrentUser: async () =>
      state.actor
        ? (await import("@/lib/db")).db.user.findUnique({
            where: { id: state.actor },
          })
        : null,
    requireUser: async () => {
      if (!state.actor) throw Error("no actor");
      return (await import("@/lib/db")).db.user.findUniqueOrThrow({
        where: { id: state.actor },
      });
    },
    requireStaff: async () => {
      return (await import("@/lib/db")).db.user.findFirstOrThrow({
        where: { name: { startsWith: "Local Audit" }, role: "ADMIN" },
      });
    },
  };
});
import { db } from "@/lib/db";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as toggle } from "@/app/api/account/2fa/route";
import { PATCH as account } from "@/app/api/account/route";
import { POST as reset } from "@/app/api/auth/reset/route";
import { POST as register } from "@/app/api/auth/register/route";
import { hashOneTimeToken } from "@/lib/tokens";
import { signSessionToken, getSession } from "@/lib/auth";
// Prisma's relation-chaining helpers are irrelevant for these awaited call barriers.
function awaitedMethods<T extends object>(delegate: T) {
  return delegate as unknown as {
    [K in keyof T]: T[K] extends (...args: infer A) => infer R
      ? (...args: A) => Promise<Awaited<R>>
      : T[K];
  };
}
const prefix = "fullfix-" + Date.now();
const ids = [0, 1, 2, 3].map((n) => prefix + "-" + n);
let category = "",
  listing = "",
  ip = 1;
function request(body: unknown, method = "POST") {
  return new Request("http://localhost/api/test", {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": "10.87.0." + ip++,
    },
    body: JSON.stringify(body),
  });
}
beforeAll(async () => {
  await db.user.createMany({
    data: ids.map((id, i) => ({
      id,
      name: "Local Audit " + i,
      email: id + "@example.invalid",
      city: "الرياض",
      passwordHash: hashSync("InitialAudit123", 4),
      emailVerifiedAt: new Date(),
    })),
  });
  const cat = await db.category.findFirst();
  if (!cat) throw Error("category fixture required");
  category = cat.id;
  listing = (
    await db.listing.create({
      data: {
        title: "Local Audit Offer",
        description: "Local audit transaction concurrency evidence",
        sellerId: ids[2],
        categoryId: category,
        city: "الرياض",
        condition: "USED",
        type: "STANDARD",
        price: 100,
        status: "ACTIVE",
        images: "[]",
        searchText: "audit",
      },
    })
  ).id;
});
beforeEach(() => {
  state.actor = "";
  state.cookie = "";
  state.mail = true;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await db.backgroundJob.deleteMany({
    where: { payload: { contains: prefix } },
  });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.backgroundJob.deleteMany({
    where: { kind: "AVATAR_CLEANUP", payload: { contains: state.avatarUrl } },
  });
  await db.transaction.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.listing.deleteMany({
    where: { OR: [{ id: listing }, { id: { startsWith: prefix } }] },
  });
  await db.user.deleteMany({
    where: { OR: [{ id: { in: ids } }, { email: { startsWith: prefix } }] },
  });
  await db.$disconnect();
});
it("SEC-01: stale credentials cannot issue a fresh session", async () => {
  const orig = db.user.findFirst.bind(db.user);
  const spy = vi
    .spyOn(awaitedMethods(db.user), "findFirst")
    .mockImplementationOnce(async (args) => {
      const u = await orig(args);
      await db.user.update({
        where: { id: ids[0] },
        data: {
          passwordHash: hashSync("ReplacedAudit123", 4),
          sessionVersion: { increment: 1 },
        },
      });
      return u;
    });
  const res = await login(
    request({
      identifier: ids[0] + "@example.invalid",
      password: "InitialAudit123",
    }),
  );
  spy.mockRestore();
  expect(res.status).toBe(409);
  expect(res.headers.get("set-cookie")).toBeNull();
});
it("SEC-02: 2FA changes require password and mailbox proof and revoke old sessions", async () => {
  state.actor = ids[1];
  await db.user.update({
    where: { id: ids[1] },
    data: { twoFactorEmail: true },
  });
  const token = await signSessionToken({
    sub: ids[1],
    name: "Audit",
    role: "USER",
  });
  expect((await toggle(request({ enabled: false }))).status).toBe(400);
  expect((await db.user.findUniqueOrThrow({ where: { id: ids[1] } })).twoFactorEmail).toBe(true);
  const issue = await toggle(request({ enabled: false, currentPassword: "InitialAudit123" }));
  expect(issue.status).toBe(200);
  const challenge = (await issue.json()).challenge;
  const change = await toggle(
    request({
      enabled: false,
      currentPassword: "InitialAudit123",
      challenge,
      code: state.codes.at(-1),
    }),
  );
  expect(change.status).toBe(200);
  const u = await db.user.findUniqueOrThrow({ where: { id: ids[1] } });
  expect(u.twoFactorEmail).toBe(false);
  expect(u.sessionVersion).toBe(1);
  state.cookie = token;
  expect(await getSession()).toBeNull();
});
it("SEC-03: mailbox changes revoke old recovery links", async () => {
  state.actor = ids[1];
  const raw = randomBytes(32).toString("hex");
  await db.passwordResetToken.create({
    data: {
      userId: ids[1],
      token: hashOneTimeToken(raw),
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  const change = await account(
    request(
      {
        name: "Local Audit Changed",
        city: "الرياض",
        email: prefix + "-changed@example.invalid",
        currentPassword: "InitialAudit123",
      },
      "PATCH",
    ),
  );
  expect(change.status).toBe(200);
  const finish = await reset(request({ token: raw, password: "OldInboxReset123" }));
  expect(finish.status).toBe(400);
});
it("SEC-04: successful password reset revokes sibling recovery links", async () => {
  const raw1 = randomBytes(32).toString("hex"),
    raw2 = randomBytes(32).toString("hex");
  await db.passwordResetToken.createMany({
    data: [raw1, raw2].map((raw) => ({
      userId: ids[0],
      token: hashOneTimeToken(raw),
      expiresAt: new Date(Date.now() + 600000),
    })),
  });
  expect((await reset(request({ token: raw1, password: "FirstResetAudit123" }))).status).toBe(200);
  expect((await reset(request({ token: raw2, password: "SecondResetAudit123" }))).status).toBe(400);
});
it("SEC-05: ambiguous bcrypt passwords are rejected including UTF8 byte overflow", async () => {
  const a = "A".repeat(72) + "X";
  const email = prefix + "-long@example.invalid";
  const r = await register(
    request({
      name: "Local Audit Password",
      email,
      city: "الرياض",
      password: a,
      acceptTerms: true,
    }),
  );
  expect(r.status).toBe(400);
  expect(await db.user.findUnique({ where: { email } })).toBeNull();
  expect(
    (
      await register(
        request({
          name: "Local Audit Password",
          email,
          city: "الرياض",
          password: "ع".repeat(37),
          acceptTerms: true,
        }),
      )
    ).status,
  ).toBe(400);
});
it("FUN-01: concurrent acceptance creates one agreement and notification", async () => {
  state.actor = ids[2];
  const offer = await db.offer.create({
    data: { listingId: listing, buyerId: ids[3], amount: 100, note: null },
  });
  const original = db.offer.findUnique.bind(db.offer);
  let arrivals = 0,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi.spyOn(awaitedMethods(db.offer), "findUnique").mockImplementation(async (args) => {
    const snapshot = await original(args);
    if (++arrivals === 2) release();
    await gate;
    return snapshot;
  });
  const { acceptOfferAction } = await import("@/app/(site)/dashboard/offers/actions");
  const fd = new FormData();
  fd.set("offerId", offer.id);
  const results = await Promise.all([acceptOfferAction(fd), acceptOfferAction(fd)]);
  spy.mockRestore();
  expect(results.filter((r) => "ok" in r && r.ok)).toHaveLength(1);
  const conv = await db.conversation.findUniqueOrThrow({
    where: { listingId_buyerId: { listingId: listing, buyerId: ids[3] } },
  });
  expect(await db.message.count({ where: { conversationId: conv.id } })).toBe(1);
  expect(await db.notification.count({ where: { userId: ids[3], type: "OFFER" } })).toBe(1);
});
it("SEC-06: production without SMTP fails closed without exposing a recovery secret", async () => {
  state.mail = false;
  vi.stubEnv("NODE_ENV", "production");
  try {
    const { POST } = await import("@/app/api/auth/forgot/route");
    const res = await POST(request({ email: ids[0] + "@example.invalid" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.resetUrl).toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
  }
});
it("SEC-07: mobile home hides banned sellers", async () => {
  await db.user.update({ where: { id: ids[2] }, data: { isBanned: true } });
  const { GET } = await import("@/app/api/mobile/home/route");
  const res = await GET();
  const body = await res.json();
  expect(body.latest.some((x: { id: string }) => x.id === listing)).toBe(false);
  await db.user.update({ where: { id: ids[2] }, data: { isBanned: false } });
});
it("FUN-02: rendering does not mark read and client receipt affects displayed ids only", async () => {
  state.actor = ids[3];
  await db.notification.deleteMany({ where: { userId: ids[3] } });
  await db.notification.createMany({
    data: Array.from({ length: 51 }, (_, i) => ({
      userId: ids[3],
      type: "SYSTEM",
      title: "Local " + i,
      body: "Local audit notification",
    })),
  });
  const { default: Page } = await import("@/app/(site)/dashboard/notifications/page");
  await Page({ searchParams: Promise.resolve({}) });
  expect(
    await db.notification.count({
      where: { userId: ids[3], readAt: { not: null } },
    }),
  ).toBe(0);
  const shown = await db.notification.findMany({
    where: { userId: ids[3] },
    take: 50,
  });
  state.cookie = await signSessionToken({
    sub: ids[3],
    name: "Local Audit",
    role: "USER",
  });
  const { POST: read } = await import("@/app/api/notifications/read/route");
  expect((await read(request({ ids: shown.map((n) => n.id) }))).status).toBe(200);
  expect(
    await db.notification.count({
      where: { userId: ids[3], readAt: { not: null } },
    }),
  ).toBe(50);
});
it("FUN-03: stale resubmission cannot overwrite concurrent approval", async () => {
  state.actor = ids[2];
  await db.user.update({ where: { id: ids[0] }, data: { role: "ADMIN" } });
  let requestId = "";
  const original = db.identityVerification.findUnique.bind(db.identityVerification);
  const spy = vi
    .spyOn(awaitedMethods(db.identityVerification), "findUnique")
    .mockImplementationOnce(async (args) => {
      const snapshot = await original(args);
      const row = await db.identityVerification.create({
        data: {
          userId: ids[2],
          docPath: "virtual-other-submission.webp",
          status: "PENDING",
        },
      });
      requestId = row.id;
      const { reviewVerification } = await import("@/lib/admin-verification");
      const decision = new FormData();
      decision.set("requestId", row.id);
      expect((await reviewVerification("identity", true, decision)).ok).toBe(true);
      return snapshot;
    });
  const { POST } = await import("@/app/api/identity/route");
  const fd = new FormData();
  fd.set("document", new File(["local-audit"], "proof.png", { type: "image/png" }));
  const res = await POST(
    new Request("http://localhost/api/identity", {
      method: "POST",
      body: fd,
      headers: { "x-real-ip": "10.87.0." + ip++ },
    }),
  );
  spy.mockRestore();
  expect(res.status).toBe(409);
  expect(
    (
      await db.identityVerification.findUniqueOrThrow({
        where: { id: requestId },
      })
    ).status,
  ).toBe("APPROVED");
  expect((await db.user.findUniqueOrThrow({ where: { id: ids[2] } })).idVerified).toBe(true);
});
it("FUN-04: mobile archive contains valid sold ended auctions", async () => {
  await db.listing.update({
    where: { id: listing },
    data: { type: "AUCTION", status: "SOLD" },
  });
  await db.auction.create({
    data: {
      listingId: listing,
      startPrice: 100,
      endsAt: new Date(Date.now() - 60000),
      status: "ENDED",
    },
  });
  const { GET } = await import("@/app/api/mobile/auctions/route");
  const res = await GET(new Request("http://localhost/api/mobile/auctions?status=ENDED"));
  const body = await res.json();
  expect(body.items.some((x: { id: string }) => x.id === listing)).toBe(true);
});
it("SEC-08: ended web auction cards hide removed listings", async () => {
  await db.listing.update({
    where: { id: listing },
    data: { status: "REMOVED" },
  });
  const original = db.listing.findMany.bind(db.listing);
  let exposed = false;
  const spy = vi.spyOn(awaitedMethods(db.listing), "findMany").mockImplementation(async (args) => {
    const rows = await original(args);
    if (JSON.stringify(args?.where).includes("NO_SALE"))
      exposed = rows.some((r) => r.id === listing);
    return rows;
  });
  const { default: Page } = await import("@/app/(site)/auctions/page");
  await Page({ searchParams: Promise.resolve({}) });
  spy.mockRestore();
  expect(exposed).toBe(false);
});

it("HS-09: invalid pages are rejected before database queries", async () => {
  const { GET: auctions } = await import("@/app/api/mobile/auctions/route");
  const { GET: wallet } = await import("@/app/api/mobile/me/wallet/route");
  state.actor = ids[3];
  for (const page of ["Infinity", "NaN", "1.5", "-1", "0", "10001", "1e9"]) {
    expect(
      (
        await auctions(
          new Request("http://localhost/api? page=1".replace("? page=1", "?page=" + page)),
        )
      ).status,
    ).toBe(400);
    expect((await wallet(new Request("http://localhost/api?page=" + page))).status).toBe(400);
  }
});
it("HS-15: database relevance ranks matches beyond the first 200 and preserves all filters", async () => {
  const term = "rankaudit" + Date.now();
  await db.listing.createMany({
    data: Array.from({ length: 210 }, (_, i) => ({
      id: prefix + "-rank-" + i,
      sellerId: ids[2],
      categoryId: category,
      title: i === 209 ? term : "Other match",
      description: "Local audit",
      searchText: term,
      price: 100,
      city: "الرياض",
      condition: "NEW",
      type: "STANDARD",
      status: "ACTIVE",
    })),
  });
  const { relevancePage } = await import("@/lib/search-relevance");
  expect((await relevancePage({ q: term }, 1, 24))[0]).toBe(prefix + "-rank-209");
  const wildcard = await relevancePage({ q: term + "%" }, 1, 24);
  expect(wildcard).toHaveLength(24);
  expect(await relevancePage({ q: "' OR 1=1 --" }, 1, 24)).toHaveLength(0);
  const pages = await Promise.all(
    Array.from({ length: 9 }, (_, i) =>
      relevancePage({ q: term, city: "الرياض", min: "50", max: "200" }, i + 1, 24),
    ),
  );
  expect(new Set(pages.flat()).size).toBe(210);
  expect(await relevancePage({ q: term, min: "200" }, 1, 24)).toHaveLength(0);
  expect(await relevancePage({ q: term, verified: "1" }, 1, 24)).toHaveLength(24);
});
it("HS-12: failed browser fetch becomes a recoverable error response", async () => {
  const { clientFetch } = await import("@/lib/client-fetch");
  vi.stubGlobal("fetch", async () => {
    throw Error("offline");
  });
  try {
    const response = await clientFetch("/api/account");
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBeTruthy();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("HS-08: stale store upload cannot overwrite concurrent approval", async () => {
  state.actor = ids[2];
  const store = await db.store.create({
    data: {
      userId: ids[2],
      name: "Local Audit Store",
      slug: prefix + "-store",
    },
  });
  const original = db.storeVerification.findUnique.bind(db.storeVerification);
  const spy = vi
    .spyOn(awaitedMethods(db.storeVerification), "findUnique")
    .mockImplementationOnce(async (args) => {
      const old = await original(args);
      const row = await db.storeVerification.create({
        data: { storeId: store.id, docPath: "audit-virtual-store.webp" },
      });
      const { reviewVerification } = await import("@/lib/admin-verification");
      const data = new FormData();
      data.set("requestId", row.id);
      expect((await reviewVerification("store", true, data)).ok).toBe(true);
      return old;
    });
  const { POST } = await import("@/app/api/store/verify/route");
  const data = new FormData();
  data.set("storeId", store.id);
  data.set("document", new File(["audit"], "doc.png", { type: "image/png" }));
  const response = await POST(
    new Request("http://localhost/api/store/verify", {
      method: "POST",
      body: data,
      headers: { "x-real-ip": "10.87.0." + ip++ },
    }),
  );
  spy.mockRestore();
  expect(response.status).toBe(409);
  expect((await db.store.findUniqueOrThrow({ where: { id: store.id } })).isVerified).toBe(true);
});
it("HS-03: concurrent forgot requests leave only one recovery token", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { id: ids[1] } });
  const { POST } = await import("@/app/api/auth/forgot/route");
  const results = await Promise.all([
    POST(request({ email: user.email })),
    POST(request({ email: user.email })),
  ]);
  expect(results.every((r) => r.status === 200)).toBe(true);
  expect(
    await db.passwordResetToken.count({
      where: { userId: user.id, usedAt: null },
    }),
  ).toBe(1);
});
it("HS-14: mobile ledger, campaigns, profile and store expose subsequent pages", async () => {
  state.actor = ids[3];
  state.cookie = await signSessionToken({
    sub: ids[3],
    role: "USER",
    name: "Audit",
  });
  await db.pointTransaction.createMany({
    data: Array.from({ length: 40 }, () => ({
      userId: ids[3],
      delta: 1,
      reason: "Local audit",
    })),
  });
  const { GET: wallet } = await import("@/app/api/mobile/me/wallet/route");
  const w = await (await wallet(new Request("http://localhost/api?page=2"))).json();
  expect(w.ledger).toHaveLength(10);
  expect(w.total).toBe(40);
  expect(w.hasMore).toBe(false);
  await db.campaign.createMany({
    data: Array.from({ length: 40 }, () => ({
      ownerId: ids[3],
      listingId: listing,
      pointsSpent: 0,
      status: "COMPLETED",
    })),
  });
  const { GET: campaigns } = await import("@/app/api/mobile/me/campaigns/route");
  const c = await (await campaigns(new Request("http://localhost/api?page=2"))).json();
  expect(c.items).toHaveLength(10);
  expect(c.total).toBe(40);
  const store = await db.store.findFirstOrThrow({ where: { userId: ids[2] } });
  await db.listing.updateMany({
    where: { id: { startsWith: prefix + "-rank-" } },
    data: { storeId: store.id },
  });
  const { GET: profile } = await import("@/app/api/mobile/profile/[id]/route");
  const p = await (
    await profile(new Request("http://localhost/api?page=7"), {
      params: Promise.resolve({ id: ids[2] }),
    })
  ).json();
  expect(p.listings).toHaveLength(30);
  expect(p.total).toBe(210);
  const { GET: storePage } = await import("@/app/api/mobile/stores/[slug]/route");
  const st = await (
    await storePage(new Request("http://localhost/api?page=7"), {
      params: Promise.resolve({ slug: store.slug }),
    })
  ).json();
  expect(st.listings).toHaveLength(30);
  expect(st.hasMore).toBe(false);
});
it("HS-24: removing an avatar queues cleanup and shared references prevent deletion", async () => {
  state.actor = ids[3];
  await db.user.updateMany({
    where: { id: { in: [ids[2], ids[3]] } },
    data: { avatarUrl: state.avatarUrl },
  });
  const { DELETE } = await import("@/app/api/account/avatar/route");
  expect((await DELETE()).status).toBe(200);
  expect(
    await db.backgroundJob.count({
      where: { kind: "AVATAR_CLEANUP", payload: { contains: state.avatarUrl } },
    }),
  ).toBe(1);
  const { deleteUnusedAvatar } = await import("@/lib/avatar-cleanup");
  await deleteUnusedAvatar(state.avatarUrl);
  expect(state.avatarDeletes).toHaveLength(0);
  await db.user.update({ where: { id: ids[2] }, data: { avatarUrl: null } });
  await deleteUnusedAvatar(state.avatarUrl);
  expect(state.avatarDeletes).toEqual([state.avatarUrl]);
});
it("HS-02: Google-only accounts still require a fresh mailbox code", async () => {
  state.actor = ids[3];
  await db.user.update({
    where: { id: ids[3] },
    data: { passwordHash: "oauth:google:audit", googleSub: prefix + "-google" },
  });
  const issued = await toggle(request({ enabled: true }));
  expect(issued.status).toBe(200);
  const body = await issued.json();
  expect(body.requiresOtp).toBe(true);
  const result = await toggle(
    request({
      enabled: true,
      challenge: body.challenge,
      code: state.codes.at(-1),
    }),
  );
  expect(result.status).toBe(200);
  expect((await db.user.findUniqueOrThrow({ where: { id: ids[3] } })).twoFactorEmail).toBe(true);
});
