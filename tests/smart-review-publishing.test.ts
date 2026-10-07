import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

const state = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", async (original) => {
  const real = await original<typeof import("@/lib/auth")>();
  return {
    ...real,
    getCurrentUser: async () =>
      (await import("@/lib/db")).db.user.findUniqueOrThrow({ where: { id: state.userId } }),
  };
});
vi.mock("@/lib/rate-limit", () => ({ rateLimitGuard: async () => null }));
vi.mock("@/lib/uploads", async (original) => {
  const real = await original<typeof import("@/lib/uploads")>();
  return {
    ...real,
    saveImages: async () => ({ ok: true, urls: [] }),
    deleteImages: async () => {},
  };
});
import { POST } from "@/app/api/listings/route";
import { PATCH } from "@/app/api/listings/[id]/route";

const mark = `smart-publish-${Date.now()}`;
let categoryId = "";
const listingIds: string[] = [];
function form(title: string, type = "STANDARD") {
  const fd = new FormData();
  for (const [key, value] of Object.entries({
    title,
    description: "منتج واضح التفاصيل بحالة جيدة ومتاح للتواصل الجاد",
    city: "الرياض",
    categoryId,
    type,
    goal: type === "AUCTION" ? "AUCTION" : "SELL",
    condition: "USED",
    price: "500",
    startPrice: "500",
    minIncrement: "50",
    durationHours: "24",
  }))
    fd.set(key, value);
  return fd;
}
async function create(title: string, type = "STANDARD") {
  const response = await POST(
    new Request("http://localhost/api/listings", { method: "POST", body: form(title, type) }),
  );
  const body = await response.json();
  expect(response.status).toBe(200);
  listingIds.push(body.id);
  return body as { id: string; pendingReview: boolean };
}
beforeAll(async () => {
  state.userId = (
    await db.user.create({
      data: {
        name: mark,
        email: `${mark}@example.invalid`,
        passwordHash: "x",
        city: "الرياض",
      },
    })
  ).id;
  categoryId = (
    await db.category.create({
      data: {
        slug: mark,
        nameAr: "أجهزة متنوعة",
        nameEn: "Misc items",
        icon: "Box",
      },
    })
  ).id;
});
afterAll(async () => {
  await db.backgroundJob.deleteMany({
    where: { dedupKey: { in: listingIds.map((id) => `listing:${id}`) } },
  });
  await db.listing.deleteMany({ where: { id: { in: listingIds } } });
  await db.category.delete({ where: { id: categoryId } });
  await db.user.delete({ where: { id: state.userId } });
});

describe("seller publishing gate", () => {
  it("publishes an ordinary sale immediately and queues its alert", async () => {
    const created = await create("آيفون مستعمل بحالة ممتازة");
    expect(created.pendingReview).toBe(false);
    expect((await db.listing.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(
      "ACTIVE",
    );
    expect(await db.backgroundJob.count({ where: { dedupKey: `listing:${created.id}` } })).toBe(1);
  });

  it("holds a regulated offer without sending a public alert", async () => {
    const created = await create("نوفر سيولة تابي وتمارا");
    expect(created.pendingReview).toBe(true);
    const row = await db.listing.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe("PENDING");
    expect(row.riskLevel).toBe("REGULATED");
    expect(await db.backgroundJob.count({ where: { dedupKey: `listing:${created.id}` } })).toBe(0);
  });

  it("keeps a regulated auction inactive until reviewed", async () => {
    const created = await create("صقر للبيع بالمزاد", "AUCTION");
    expect(created.pendingReview).toBe(true);
    expect((await db.auction.findUniqueOrThrow({ where: { listingId: created.id } })).status).toBe(
      "PENDING",
    );
  });

  it("holds a previously active sale after a sensitive edit", async () => {
    const created = await create("جهاز إلكتروني بحالة جيدة");
    const fd = form("جهاز طبي للبيع بحالة ممتازة");
    fd.set("keepImages", "[]");
    const response = await PATCH(
      new Request(`http://localhost/api/listings/${created.id}`, {
        method: "PATCH",
        body: fd,
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).pendingReview).toBe(true);
    expect((await db.listing.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(
      "PENDING",
    );
  });
});
