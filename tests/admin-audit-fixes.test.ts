import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { hashSync } from "bcryptjs";
const state = vi.hoisted(() => ({
  actor: "",
  sent: true,
  codes: [] as Array<{ email: string; code: string }>,
  deletes: [] as string[],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ delete: (name: string) => state.deletes.push(name) }),
}));
vi.mock("@/lib/email", () => ({
  emailConfigured: () => true,
  sendEmail: async () => state.sent,
  sendLoginCodeEmail: async (email: string, code: string) => {
    state.codes.push({ email, code });
    return state.sent;
  },
}));
vi.mock("@/lib/auth", async (original) => {
  const real = await original<typeof import("@/lib/auth")>();
  return {
    ...real,
    requireStaff: async (roles: string[]) => {
      const user = await (
        await import("@/lib/db")
      ).db.user.findUniqueOrThrow({ where: { id: state.actor } });
      if (!roles.includes(user.role) || user.isBanned) throw Error("FORBIDDEN");
      return user;
    },
  };
});
import { db } from "@/lib/db";
import { pageNumber, text, publicAsset } from "@/lib/admin";
import { csvCell, financeFilter } from "@/lib/admin-finance";
import { startOtpChallenge, type OtpPurpose } from "@/lib/login-otp";
import { hashOtp } from "@/lib/login-guard";
import { verifyLoginOtp, resendLoginOtp } from "@/lib/login-otp-routes";
import { POST as login } from "@/app/api/admin-auth/login/route";
import { POST as reset } from "@/app/api/admin-auth/reset/route";
import {
  requestAccountCodeAction,
  updateAccountAction,
  confirmAccountEmailAction,
  changeAccountPasswordAction,
} from "@/app/admin/account/actions";
import {
  adjustUserPointsAction,
  broadcastAction,
  restoreListingAction,
  removeListingAction,
  createBannerAction,
  updateBannerAction,
  updatePlanAction,
  savePointPackageAction,
  createStaffAction,
  requestStaffChangeCodeAction,
  notifyUserAction,
} from "@/app/admin/actions";
import { reviewVerification } from "@/lib/admin-verification";
import { deliverBroadcastBatch } from "@/lib/background-jobs";
import { getSetting, setSetting } from "@/lib/settings";
const prefix = `adminfix-${Date.now()}`,
  ids = [`${prefix}-a`, `${prefix}-b`, `${prefix}-c`];
let category = "",
  listing = "",
  auction = "",
  store = "";
const freePlan = "";
function fd(entries: Record<string, string | number>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, String(v));
  return data;
}
let ip = 1;
function req(data: unknown) {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": `10.44.${Math.floor(ip / 250)}.${ip++ % 250}`,
    },
    body: JSON.stringify(data),
  });
}
async function plant(userId: string, purpose: OtpPurpose, email?: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } }),
    challenge = randomBytes(32).toString("hex");
  return db.loginOtp.create({
    data: {
      userId,
      purpose,
      challenge,
      issuedEmail: email ?? user.email,
      sessionVersion: user.sessionVersion,
      deliveredAt: new Date(),
      codeHash: hashOtp("123456", challenge),
      expiresAt: new Date(Date.now() + 600000),
    },
  });
}
beforeAll(async () => {
  await db.user.createMany({
    data: ids.map((id, i) => ({
      id,
      name: prefix,
      email: `${id}@example.invalid`,
      role: i === 0 ? "ADMIN" : "USER",
      passwordHash: hashSync("CorrectAdmin123", 4),
      city: "الرياض",
      emailVerifiedAt: new Date(),
      points: 10,
    })),
  });
  state.actor = ids[0];
  category = (
    await db.category.create({
      data: { slug: prefix, nameAr: prefix, nameEn: prefix, icon: "Box" },
    })
  ).id;
  listing = (
    await db.listing.create({
      data: {
        title: prefix,
        description: "fixture",
        sellerId: ids[1],
        categoryId: category,
        city: "الرياض",
      },
    })
  ).id;
  auction = (
    await db.auction.create({
      data: {
        listingId: listing,
        startPrice: 100,
        endsAt: new Date(Date.now() + 3600000),
      },
    })
  ).id;
  store = (
    await db.store.create({
      data: { userId: ids[2], slug: prefix, name: prefix },
    })
  ).id;
});
beforeEach(async () => {
  state.sent = true;
  state.actor = ids[0];
  state.codes = [];
  await db.user.update({
    where: { id: ids[0] },
    data: {
      role: "ADMIN",
      isBanned: false,
      failedLogins: 0,
      lastFailedAt: null,
      lockUntil: null,
    },
  });
});
afterAll(async () => {
  await db.backgroundJob.deleteMany({
    where: { payload: { contains: prefix } },
  });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.banner.deleteMany({ where: { title: { startsWith: prefix } } });
  if (freePlan) await db.plan.delete({ where: { id: freePlan } });
  await db.listing.delete({ where: { id: listing } });
  await db.user.deleteMany({
    where: {
      OR: [{ id: { startsWith: prefix } }, { email: { startsWith: prefix } }],
    },
  });
  await db.category.delete({ where: { id: category } });
  await db.setting.deleteMany({ where: { key: prefix } });
  await db.$disconnect();
});
it("A01: sensitive email update requires a fresh code; no unverified replacement", async () => {
  const original = await db.user.findUniqueOrThrow({ where: { id: ids[0] } });
  const result = await updateAccountAction(
    fd({ name: prefix, email: `${prefix}-new@example.invalid` }),
  );
  expect(result.ok).toBe(false);
  expect((await db.user.findUniqueOrThrow({ where: { id: ids[0] } })).email).toBe(original.email);
});
it("A01/A02: current mailbox proof, then new mailbox proof and session revocation", async () => {
  const current = await requestAccountCodeAction();
  const currentCode = state.codes.at(-1)!.code;
  const next = await updateAccountAction(
    fd({
      name: prefix,
      email: `${prefix}-new@example.invalid`,
      challenge: current.challenge!,
      code: currentCode,
    }),
  );
  expect(next.stage).toBe("email");
  const before = await db.user.findUniqueOrThrow({ where: { id: ids[0] } });
  expect(before.email).toBe(`${ids[0]}@example.invalid`);
  const done = await confirmAccountEmailAction(
    fd({ challenge: next.challenge!, code: state.codes.at(-1)!.code }),
  );
  expect(done.ok).toBe(true);
  const after = await db.user.findUniqueOrThrow({ where: { id: ids[0] } });
  expect(after.email).toBe(`${prefix}-new@example.invalid`);
  expect(after.emailVerifiedAt).not.toBeNull();
  expect(after.sessionVersion).toBe(before.sessionVersion + 1);
  expect(await db.loginOtp.count({ where: { userId: ids[0] } })).toBe(0);
  expect(state.deletes).toContain("samel_admin");
  await db.user.update({
    where: { id: ids[0] },
    data: { email: `${ids[0]}@example.invalid` },
  });
});
it("A02: a pre-revocation challenge cannot sign a new admin session", async () => {
  const row = await plant(ids[0], "ADMIN_LOGIN");
  await db.user.update({
    where: { id: ids[0] },
    data: { sessionVersion: { increment: 1 } },
  });
  const res = await verifyLoginOtp(req({ challenge: row.challenge, code: "123456" }), true);
  expect(res.status).toBe(400);
  expect(res.headers.get("set-cookie")).toBeNull();
});
it("A02: code purpose and mailbox cannot be exchanged", async () => {
  const row = await plant(ids[0], "ADMIN_STEPUP");
  expect(
    (await verifyLoginOtp(req({ challenge: row.challenge, code: "123456" }), true)).status,
  ).toBe(400);
  const site = await plant(ids[1], "SITE_LOGIN");
  await db.user.update({
    where: { id: ids[1] },
    data: { email: `${prefix}-changed@example.invalid` },
  });
  expect(
    (await verifyLoginOtp(req({ challenge: site.challenge, code: "123456" }), false)).status,
  ).toBe(400);
  await db.user.update({
    where: { id: ids[1] },
    data: { email: `${ids[1]}@example.invalid` },
  });
});
it("A02: password change requires proof and invalidates every pending code", async () => {
  const step = await plant(ids[0], "ADMIN_STEPUP");
  await plant(ids[0], "ADMIN_LOGIN");
  const result = await changeAccountPasswordAction(
    fd({
      challenge: step.challenge,
      code: "123456",
      password: "CorrectAdmin123",
      confirm: "CorrectAdmin123",
    }),
  );
  expect(result.ok).toBe(true);
  expect(await db.loginOtp.count({ where: { userId: ids[0] } })).toBe(0);
});
it("A04/A18: concurrent identity decisions commit a single consistent outcome", async () => {
  const request = await db.identityVerification.create({
    data: { userId: ids[1], docPath: "fixture.webp" },
  });
  const results = await Promise.all([
    reviewVerification("identity", true, fd({ requestId: request.id })),
    reviewVerification("identity", false, fd({ requestId: request.id })),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  const row = await db.identityVerification.findUniqueOrThrow({
      where: { id: request.id },
    }),
    user = await db.user.findUniqueOrThrow({ where: { id: ids[1] } });
  expect(user.idVerified).toBe(row.status === "APPROVED");
});
it("A04: concurrent store decisions agree with the badge", async () => {
  const request = await db.storeVerification.create({
    data: { storeId: store, docPath: "fixture.webp" },
  });
  const results = await Promise.all([
    reviewVerification("store", false, fd({ requestId: request.id })),
    reviewVerification("store", true, fd({ requestId: request.id })),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  const row = await db.storeVerification.findUniqueOrThrow({
    where: { id: request.id },
  });
  expect((await db.store.findUniqueOrThrow({ where: { id: store } })).isVerified).toBe(
    row.status === "APPROVED",
  );
});
it("A05: concurrent bad admin passwords lock the account without lost attempts", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { id: ids[0] } });
  const results = await Promise.all(
    Array.from({ length: 10 }, () => login(req({ email: user.email, password: "wrong" }))),
  );
  expect(results.some((r) => r.status === 423)).toBe(true);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: ids[0] } })).lockUntil!.getTime(),
  ).toBeGreaterThan(Date.now());
});
it("A06: failed initial mail leaves no reusable challenge", async () => {
  await db.loginOtp.deleteMany({ where: { userId: ids[0] } });
  state.sent = false;
  const user = await db.user.findUniqueOrThrow({ where: { id: ids[0] } });
  expect((await startOtpChallenge(user, "ADMIN_LOGIN")).ok).toBe(false);
  expect((await startOtpChallenge(user, "ADMIN_LOGIN")).ok).toBe(false);
  expect(await db.loginOtp.count({ where: { userId: ids[0] } })).toBe(0);
});
it("A06: failed resend preserves the previously delivered code", async () => {
  const row = await plant(ids[0], "ADMIN_LOGIN");
  await db.loginOtp.update({
    where: { id: row.id },
    data: { lastSentAt: new Date(Date.now() - 61000) },
  });
  state.sent = false;
  const res = await resendLoginOtp(req({ challenge: row.challenge }), true);
  expect(res.status).toBe(503);
  expect(
    (await verifyLoginOtp(req({ challenge: row.challenge, code: "123456" }), true)).status,
  ).toBe(200);
});
it("A08: insufficient debit returns failure without a ledger entry or audit", async () => {
  await db.user.update({ where: { id: ids[1] }, data: { points: 10 } });
  const logs = await db.auditLog.count({
      where: { actorId: ids[0], action: "ADJUST_POINTS" },
    }),
    ledger = await db.pointTransaction.count({ where: { userId: ids[1] } });
  expect((await adjustUserPointsAction(fd({ userId: ids[1], delta: -11 }))).ok).toBe(false);
  expect((await db.user.findUniqueOrThrow({ where: { id: ids[1] } })).points).toBe(10);
  expect(
    await db.auditLog.count({
      where: { actorId: ids[0], action: "ADJUST_POINTS" },
    }),
  ).toBe(logs);
  expect(await db.pointTransaction.count({ where: { userId: ids[1] } })).toBe(ledger);
});
it("A08/A18: competing debit requests preserve the balance and truthful audits", async () => {
  const result = await Promise.all(
    Array.from({ length: 5 }, () => adjustUserPointsAction(fd({ userId: ids[1], delta: -6 }))),
  );
  expect(result.filter((r) => r.ok)).toHaveLength(1);
  expect((await db.user.findUniqueOrThrow({ where: { id: ids[1] } })).points).toBe(4);
});
it("A09: a removed auction stays cancelled when restoration is requested", async () => {
  expect((await removeListingAction(fd({ listingId: listing }))).ok).toBe(true);
  expect((await restoreListingAction(fd({ listingId: listing }))).ok).toBe(false);
  expect((await db.listing.findUniqueOrThrow({ where: { id: listing } })).status).toBe("REMOVED");
  expect((await db.auction.findUniqueOrThrow({ where: { id: auction } })).status).toBe("CANCELLED");
});
it("A11: malformed pagination and repeated query parameters are bounded", () => {
  for (const value of ["Infinity", "NaN", "-1", "1.2", "99999999999", ["1", "2"], undefined])
    expect(pageNumber(value)).toBe(1);
  expect(pageNumber("2")).toBe(2);
  expect(text(["a", "b"])).toBe("");
  const expected = new URL(
    "/images/ph/car.svg",
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ).href;
  expect(publicAsset("/images/ph/car.svg")).toBe(expected);
  expect(publicAsset("https://cdn.example.com/car.svg")).toBe("https://cdn.example.com/car.svg");
});
it("A12: retrying a broadcast request creates one durable fanout and audit", async () => {
  const input = {
    title: prefix,
    body: "test fixture broadcast",
    requestId: randomBytes(16).toString("hex"),
  };
  const before = await db.auditLog.count({
    where: { actorId: ids[0], action: "BROADCAST_QUEUED" },
  });
  expect((await broadcastAction(fd(input))).ok).toBe(true);
  expect((await broadcastAction(fd(input))).ok).toBe(true);
  expect(
    await db.backgroundJob.count({
      where: { kind: "BROADCAST", payload: { contains: input.requestId } },
    }),
  ).toBe(1);
  expect(
    await db.auditLog.count({
      where: { actorId: ids[0], action: "BROADCAST_QUEUED" },
    }),
  ).toBe(before + 1);
});
it("A12: retrying a delivered batch does not duplicate inbox or push work", async () => {
  const data = {
    event: prefix,
    cursor: prefix,
    upper: ids[2],
    title: prefix,
    body: "fixture",
  };
  await deliverBroadcastBatch(data);
  await deliverBroadcastBatch(data);
  expect(
    await db.notification.count({
      where: { eventKey: { startsWith: `broadcast:${prefix}:` } },
    }),
  ).toBe(3);
  expect(
    await db.backgroundJob.count({
      where: { kind: "PUSH", payload: { contains: `\"title\":\"${prefix}\"` } },
    }),
  ).toBeGreaterThanOrEqual(1);
});
it("A13/A14: core-plan zeros survive and unsupported custom plans fail", async () => {
  const existing = await db.plan.findUnique({ where: { key: "FREE" } });
  if (existing) {
    expect(
      (
        await updatePlanAction(
          fd({
            planId: existing.id,
            name: existing.name,
            price: 0,
            maxListings: 0,
            maxAuctions: 0,
            maxStores: 0,
            dailyPoints: 0,
            features: "",
          }),
        )
      ).ok,
    ).toBe(true);
    expect((await db.plan.findUniqueOrThrow({ where: { id: existing.id } })).maxListings).toBe(0);
    await db.plan.update({
      where: { id: existing.id },
      data: {
        name: existing.name,
        price: existing.price,
        maxListings: existing.maxListings,
        maxAuctions: existing.maxAuctions,
        maxStores: existing.maxStores,
        dailyPoints: existing.dailyPoints,
        features: existing.features,
        period: existing.period,
        highlight: existing.highlight,
        isActive: existing.isActive,
      },
    });
  }
  expect(
    (
      await updatePlanAction(
        fd({
          planId: "no-plan",
          name: prefix,
          price: 0,
          maxListings: 0,
          maxAuctions: 0,
          maxStores: 0,
          dailyPoints: 0,
        }),
      )
    ).ok,
  ).toBe(false);
  expect(
    (await savePointPackageAction(fd({ name: prefix, points: 10, bonus: -1, price: 100 }))).ok,
  ).toBe(false);
});
it("A15/A23/A29: supported banners can be edited without resetting clicks", async () => {
  expect(
    (
      await createBannerAction(
        fd({ title: prefix, imageUrl: "/logo.png", position: "CATEGORY_TOP" }),
      )
    ).ok,
  ).toBe(false);
  expect(
    (
      await createBannerAction(
        fd({
          title: prefix,
          embedHtml: "<script>adsense</script>",
          position: "HOME_TOP",
        }),
      )
    ).ok,
  ).toBe(false);
  expect(
    (await createBannerAction(fd({ title: prefix, imageUrl: "/logo.png", position: "HOME_TOP" })))
      .ok,
  ).toBe(true);
  const banner = await db.banner.findFirstOrThrow({ where: { title: prefix } });
  await db.banner.update({ where: { id: banner.id }, data: { clicks: 37 } });
  expect(
    (
      await updateBannerAction(
        fd({
          bannerId: banner.id,
          title: prefix + " edited",
          imageUrl: "/logo.png",
          position: "HOME_MIDDLE",
        }),
      )
    ).ok,
  ).toBe(true);
  expect((await db.banner.findUniqueOrThrow({ where: { id: banner.id } })).clicks).toBe(37);
});
it("A16: SUPPORT cannot remove listings", async () => {
  await db.user.update({ where: { id: ids[0] }, data: { role: "SUPPORT" } });
  await expect(removeListingAction(fd({ listingId: listing }))).rejects.toThrow("FORBIDDEN");
});
it("A19: shared database setting updates are visible immediately", async () => {
  await setSetting(prefix, "one");
  expect(await getSetting(prefix)).toBe("one");
  await db.setting.update({ where: { key: prefix }, data: { value: "two" } });
  expect(await getSetting(prefix)).toBe("two");
});
it("A21: financial filters and CSV neutralize spreadsheet formulas", () => {
  expect(csvCell(-6)).toBe("-6");
  expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  expect(
    financeFilter({ status: "PAID", from: "2026-09-01", to: "2026-09-30" }).payments.status,
  ).toBe("PAID");
  expect(financeFilter({ status: ["PAID", "FAILED"], from: "bad" }).payments).toEqual({});
});
it("A22: failed invitation is explicit, existing staff cannot be silently reassigned", async () => {
  const firstProof = await requestStaffChangeCodeAction();
  const firstCode = state.codes.at(-1)!.code;
  state.sent = false;
  const result = await createStaffAction(
    fd({
      name: prefix,
      email: `${prefix}-invite@example.invalid`,
      role: "SUPPORT",
      challenge: firstProof.challenge!,
      code: firstCode,
    }),
  );
  expect(result.ok).toBe(true);
  expect(result.message).toContain("تعذّر");
  state.sent = true;
  const nextProof = await requestStaffChangeCodeAction();
  const nextCode = state.codes.at(-1)!.code;
  state.sent = false;
  const retry = await createStaffAction(
    fd({
      name: prefix,
      email: `${prefix}-invite@example.invalid`,
      role: "ADMIN",
      challenge: nextProof.challenge!,
      code: nextCode,
    }),
  );
  expect(retry.ok).toBe(false);
  expect(
    (
      await db.user.findUniqueOrThrow({
        where: { email: `${prefix}-invite@example.invalid` },
      })
    ).role,
  ).toBe("SUPPORT");
});
it("A25: recovery proves mailbox, changes password, revokes codes", async () => {
  const row = await plant(ids[0], "ADMIN_RESET"),
    before = await db.user.findUniqueOrThrow({ where: { id: ids[0] } });
  expect(
    (
      await reset(
        req({
          challenge: row.challenge,
          code: "000000",
          password: "Recovered123",
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await reset(
        req({
          challenge: row.challenge,
          code: "123456",
          password: "Recovered123",
        }),
      )
    ).status,
  ).toBe(200);
  expect((await db.user.findUniqueOrThrow({ where: { id: ids[0] } })).sessionVersion).toBe(
    before.sessionVersion + 1,
  );
  expect(await db.loginOtp.count({ where: { userId: ids[0] } })).toBe(0);
});
it("A30: retried private notice keeps a single inbox notification", async () => {
  const input = {
    userId: ids[1],
    requestId: randomBytes(16).toString("hex"),
    title: prefix,
    body: "fixture message",
  };
  await notifyUserAction(fd(input));
  await notifyUserAction(fd(input));
  expect(
    await db.notification.count({
      where: {
        eventKey: `admin-notice:${ids[0]}:${input.requestId}:${ids[1]}`,
      },
    }),
  ).toBe(1);
});
it("A18: failing audit persistence rolls back points and ledger together", async () => {
  const marker = ids[0].replaceAll("'", "''");
  await db.$executeRawUnsafe(
    `CREATE OR REPLACE FUNCTION adminfix_audit_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."actorId"='${marker}' AND NEW.action='ADJUST_POINTS' THEN RAISE EXCEPTION 'TEST_AUDIT_WRITE_FAILURE'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER adminfix_audit_reject_trigger BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION adminfix_audit_reject()',
  );
  const before = await db.user.findUniqueOrThrow({ where: { id: ids[2] } }),
    count = await db.pointTransaction.count({ where: { userId: ids[2] } });
  try {
    await expect(adjustUserPointsAction(fd({ userId: ids[2], delta: 5 }))).rejects.toThrow();
    expect((await db.user.findUniqueOrThrow({ where: { id: ids[2] } })).points).toBe(before.points);
    expect(await db.pointTransaction.count({ where: { userId: ids[2] } })).toBe(count);
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS adminfix_audit_reject_trigger ON "AuditLog"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION IF EXISTS adminfix_audit_reject()");
  }
});
it("A03/A10: closed reports cannot starve open work and archives remain paged", async () => {
  const { default: Reports } = await import("@/app/admin/reports/page");
  const args = vi.spyOn(db.report, "findMany");
  await db.report.createMany({
    data: Array.from({ length: 110 }, (_, i) => ({
      reporterId: ids[1],
      targetType: "LISTING",
      targetId: listing,
      reason: `${prefix} ${i}`,
      status: i === 109 ? "OPEN" : "RESOLVED",
    })),
  });
  try {
    const element = await Reports({ searchParams: Promise.resolve({}) });
    expect(args.mock.calls.at(-1)![0]!.where).toEqual({ status: "OPEN" });
    function contents(node: unknown): string {
      if (typeof node === "string") return node;
      if (Array.isArray(node)) return node.map(contents).join(" ");
      if (node && typeof node === "object" && "props" in node)
        return contents((node as { props: { children: unknown } }).props.children);
      return "";
    }
    expect(contents(element)).toContain(prefix + " 109");
    await Reports({
      searchParams: Promise.resolve({ status: "ALL", page: "2" }),
    });
    expect(args.mock.calls.at(-1)![0]!.skip).toBe(25);
    expect(args.mock.calls.at(-1)![0]!.take).toBe(25);
  } finally {
    args.mockRestore();
    await db.report.deleteMany({ where: { reason: { startsWith: prefix } } });
  }
});
