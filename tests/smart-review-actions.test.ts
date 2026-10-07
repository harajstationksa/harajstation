import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

const state = vi.hoisted(() => ({ actor: "" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", async (original) => {
  const real = await original<typeof import("@/lib/auth")>();
  return {
    ...real,
    requireStaff: async (roles: string[]) => {
      const user = await (
        await import("@/lib/db")
      ).db.user.findUniqueOrThrow({ where: { id: state.actor } });
      if (!roles.includes(user.role)) throw new Error("FORBIDDEN");
      return user;
    },
  };
});
import { reviewExistingListingAction, reviewListingAction } from "@/app/admin/actions";

const mark = `smart-review-${Date.now()}`;
const ids = [`${mark}-admin`, `${mark}-mod`, `${mark}-seller`];
let categoryId = "";
const listingIds: string[] = [];
function form(
  listingId: string,
  decision: string,
  note = "تم التحقق من البيانات والمستندات اللازمة",
) {
  const fd = new FormData();
  fd.set("listingId", listingId);
  fd.set("decision", decision);
  fd.set("note", note);
  return fd;
}
async function listing(title: string, riskLevel = "NORMAL", auction = false) {
  const row = await db.listing.create({
    data: {
      title,
      description: "وصف الإعلان التجريبي للمراجعة",
      city: "الرياض",
      sellerId: ids[2],
      categoryId,
      status: "PENDING",
      riskLevel,
      ...(auction
        ? {
            type: "AUCTION",
            auction: {
              create: {
                status: "PENDING",
                startPrice: 100,
                endsAt: new Date(Date.now() + 86400000),
              },
            },
          }
        : {}),
    },
  });
  listingIds.push(row.id);
  return row.id;
}
async function legacyListing(riskLevel = "REGULATED") {
  const row = await db.listing.create({
    data: {
      title: "عرض يحتاج فحصًا",
      description: "تفاصيل إعلان منشور قبل نظام المراجعة",
      city: "الرياض",
      sellerId: ids[2],
      categoryId,
      status: "ACTIVE",
      riskLevel,
      riskReasons: JSON.stringify(["FINANCING"]),
    },
  });
  listingIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  await db.user.createMany({
    data: ids.map((id, i) => ({
      id,
      name: id,
      email: `${id}@example.invalid`,
      passwordHash: "x",
      city: "الرياض",
      role: i === 0 ? "ADMIN" : i === 1 ? "MODERATOR" : "USER",
    })),
  });
  state.actor = ids[0];
  categoryId = (
    await db.category.create({
      data: {
        slug: mark,
        nameAr: "تجارب",
        nameEn: "Tests",
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
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
});

describe("staff review decisions", () => {
  it("publishes a held listing only after a documented human decision", async () => {
    const id = await listing("هاتف بحالة جيدة");
    expect((await reviewListingAction(form(id, "approve"))).ok).toBe(true);
    expect((await db.listing.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
    expect(await db.backgroundJob.count({ where: { dedupKey: `listing:${id}` } })).toBe(1);
    expect((await reviewListingAction(form(id, "approve"))).ok).toBe(false);
  });

  it("asks for information and resumes a pending auction at approval", async () => {
    const id = await listing("جهاز معروض بالمزاد", "SENSITIVE", true);
    expect(
      (await reviewListingAction(form(id, "request_info", "أضف إثبات الملكية في وصف الإعلان"))).ok,
    ).toBe(true);
    expect((await db.listing.findUniqueOrThrow({ where: { id } })).status).toBe("AWAITING_INFO");
    expect((await reviewListingAction(form(id, "approve"))).ok).toBe(false);
    await db.listing.update({ where: { id }, data: { status: "PENDING", requestMessage: null } });
    expect((await reviewListingAction(form(id, "approve"))).ok).toBe(true);
    const row = await db.auction.findUniqueOrThrow({ where: { listingId: id } });
    expect(row.status).toBe("LIVE");
    expect(row.endsAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600000);
  });

  it("reserves a possible prohibited offer for an administrator", async () => {
    const id = await listing("بيع سجائر جديدة", "PROHIBITED");
    state.actor = ids[1];
    expect((await reviewListingAction(form(id, "approve"))).ok).toBe(false);
    state.actor = ids[0];
    expect((await reviewListingAction(form(id, "approve"))).ok).toBe(false);
    expect(
      (await reviewListingAction(form(id, "reject", "يُمنع ترويج هذا المنتج عبر المنصة"))).ok,
    ).toBe(true);
    expect((await db.listing.findUniqueOrThrow({ where: { id } })).status).toBe("REMOVED");
  });

  it("records review of an old listing without hiding it", async () => {
    const id = await legacyListing();
    const result = await reviewExistingListingAction(form(id, "mark_reviewed"));
    expect(result.ok).toBe(true);
    const row = await db.listing.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("ACTIVE");
    expect(row.reviewedBy).toBe(ids[0]);
    expect(row.reviewedAt).not.toBeNull();
    const log = await db.auditLog.findFirstOrThrow({
      where: {
        action: "REVIEW_EXISTING_MARK_REVIEWED",
        detail: { contains: `listing=${id}` },
      },
    });
    expect(log.detail).toContain("from=ACTIVE; to=ACTIVE");
  });

  it("moves an old listing to review and pauses then resumes a paid campaign", async () => {
    const id = await legacyListing();
    const end = new Date(Date.now() + 2 * 86400000);
    const campaign = await db.campaign.create({
      data: {
        listingId: id,
        ownerId: ids[2],
        pointsSpent: 10,
        days: 2,
        endsAt: end,
      },
    });
    expect((await reviewExistingListingAction(form(id, "hold"))).ok).toBe(true);
    expect((await db.listing.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe(
      "PAUSED_REVIEW",
    );
    expect((await reviewListingAction(form(id, "approve"))).ok).toBe(true);
    const resumed = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(resumed.status).toBe("ACTIVE");
    expect(resumed.reviewPausedAt).toBeNull();
    expect(resumed.endsAt!.getTime()).toBeGreaterThanOrEqual(end.getTime());
  });

  it("requires an administrator to clear a prohibited old listing", async () => {
    const id = await legacyListing("PROHIBITED");
    state.actor = ids[1];
    expect((await reviewExistingListingAction(form(id, "mark_reviewed"))).ok).toBe(false);
    state.actor = ids[0];
    expect((await reviewExistingListingAction(form(id, "mark_reviewed"))).ok).toBe(false);
    const checked = form(
      id,
      "mark_reviewed",
      "راجعت العبارة والصور وتأكدت أن التصنيف غير منطبق على العرض الحالي",
    );
    checked.set("overrideProhibited", "yes");
    expect((await reviewExistingListingAction(checked)).ok).toBe(true);
  });

  it("honors a newly detected prohibited signal even when stored risk is lower", async () => {
    const id = await legacyListing("REGULATED");
    await db.listing.update({ where: { id }, data: { title: "بيع سجائر جديدة" } });
    expect((await reviewExistingListingAction(form(id, "mark_reviewed"))).ok).toBe(false);
    expect((await db.listing.findUniqueOrThrow({ where: { id } })).reviewedAt).toBeNull();
  });
});
