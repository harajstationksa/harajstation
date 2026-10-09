"use server";

import { cancelListingAuction, voidBannedBidder } from "@/lib/auction";
import { Prisma, type User } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { lockListing } from "@/lib/listing-policy";
import { resolveDispute } from "@/lib/credibility";
import { adjustPointsWithClient } from "@/lib/points";
import { safeBannerEmbedUrl } from "@/lib/banner-embed";
import { normalizeArabic } from "@/lib/arabic";
import { addReviewReason, classifyListing } from "@/lib/smart-review";
import { findBannedWord } from "@/lib/moderation";
import { notifyWithClient } from "@/lib/notify";
import { sendEmail } from "@/lib/email";
import { staffInviteTemplate } from "@/lib/email-templates";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/constants";
import { consumeOtp, startOtpChallenge } from "@/lib/login-otp";
import { ok, fail, audit, integer, text, safeLink, type AdminResult } from "@/lib/admin";
import { updateAccountAction, changeAccountPasswordAction } from "./account/actions";
import {
  canUseStaffGate,
  selectedStaffPermissions,
  type StaffPermission,
} from "@/lib/staff-permissions";

type Tx = Prisma.TransactionClient;
async function mutation(
  roles: string[],
  work: (tx: Tx, actor: User) => Promise<AdminResult>,
  ids: string[] = [],
  permission?: StaffPermission,
  staffProof?: { challenge: string; code: string },
) {
  const actor = await requireStaff(roles, permission);
  const result = await db.$transaction(
    async (tx) => {
      const locks = [...new Set([actor.id, ...ids])].filter(Boolean).sort();
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "User" WHERE id IN (${Prisma.join(locks)}) ORDER BY id FOR UPDATE`,
      );
      const fresh = await tx.user.findUniqueOrThrow({
        where: { id: actor.id },
      });
      if (
        fresh.isBanned ||
        fresh.sessionVersion !== actor.sessionVersion ||
        !canUseStaffGate(fresh, roles, permission)
      )
        return fail("تغيرت صلاحيات حسابك؛ سجل الدخول مجددًا");
      if (staffProof) {
        const proof = await consumeOtp(
          tx,
          fresh,
          "ADMIN_STAFF_CHANGE",
          staffProof.challenge,
          staffProof.code,
        );
        if (!proof.ok) return fail(proof.error);
      }
      return work(tx, fresh);
    },
    { timeout: 15000 },
  );
  if (result.ok) {
    revalidatePath("/admin", "layout");
    revalidatePath("/", "layout");
  }
  return result;
}
const field = (data: FormData, key: string, max = 200) => text(data.get(key), max);
const target = (data: FormData) => field(data, "userId");
const staffProof = (data: FormData) => ({
  challenge: field(data, "challenge", 128),
  code: field(data, "code", 6),
});
async function setting(tx: Tx, key: string, value: string) {
  await tx.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function toggleBanAction(data: FormData) {
  const id = target(data);
  return mutation(
    ["ADMIN", "MODERATOR"],
    async (tx, actor) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (
        !user ||
        user.role === "ADMIN" ||
        user.id === actor.id ||
        (actor.role !== "ADMIN" && user.role !== "USER")
      )
        return fail("لا يمكن تعديل حظر هذا الحساب");
      await tx.user.update({
        where: { id },
        data: { isBanned: !user.isBanned, sessionVersion: { increment: 1 } },
      });
      await tx.loginOtp.deleteMany({ where: { userId: id } });
      // a banned account must not keep (or win) live auctions
      const auctions = user.isBanned ? 0 : await voidBannedBidder(tx, id, actor.id);
      await audit(
        tx,
        actor.id,
        user.isBanned ? "UNBAN_USER" : "BAN_USER",
        `user=${id}; banned=${!user.isBanned}; liveAuctionsVoided=${auctions}`,
      );
      return ok(user.isBanned ? "تم رفع الحظر" : "تم حظر الحساب");
    },
    [id],
    "users.manage",
  );
}
export async function adjustCredibilityAction(data: FormData) {
  const id = target(data),
    delta = integer(data, "delta", -50, 50);
  if (!delta) return fail("التعديل عدد صحيح غير صفري بين -50 و50");
  return mutation(
    ["ADMIN", "SUPPORT"],
    async (tx, actor) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user || user.role !== "USER") return fail("يُسمح بتعديل مصداقية المستخدمين فقط");
      const after = Math.max(0, Math.min(100, user.credibility + delta));
      if (after === user.credibility) return fail("لم تتغير المصداقية؛ وصلت إلى الحد المسموح");
      const reason = field(data, "reason", 300) || "تعديل إداري";
      await tx.user.update({ where: { id }, data: { credibility: after } });
      await tx.credibilityLog.create({
        data: { userId: id, delta: after - user.credibility, reason },
      });
      await audit(
        tx,
        actor.id,
        "ADJUST_CREDIBILITY",
        `${id}: ${user.credibility} → ${after}; ${reason}`,
      );
      return ok("تم تعديل المصداقية");
    },
    [id],
    "users.credibility",
  );
}
export async function adjustUserPointsAction(data: FormData) {
  const id = target(data),
    delta = integer(data, "delta", -100000, 100000);
  if (!delta) return fail("أدخل تعديلًا صحيحًا غير صفري ضمن ±100000");
  return mutation(
    ["ADMIN", "SUPPORT"],
    async (tx, actor) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user || user.role !== "USER") return fail("حساب مستخدم غير صالح");
      const after = await adjustPointsWithClient(tx, id, delta, "تعديل إداري");
      if (after === null) return fail("الرصيد غير كافٍ؛ لم يُنفذ الخصم");
      await audit(
        tx,
        actor.id,
        "ADJUST_POINTS",
        `${id}: ${user.points} → ${after}; delta=${delta}`,
      );
      return ok(`تم تعديل النقاط؛ الرصيد الحالي ${after}`);
    },
    [id],
    "users.points",
  );
}
export async function grantProAction(data: FormData) {
  const id = target(data),
    mode = field(data, "mode"),
    days = integer(data, "days", 1, 3650);
  if (!["days", "permanent", "revoke"].includes(mode) || (mode === "days" && days === null))
    return fail("حدد طريقة المنح وعدد أيام صحيحًا من 1 إلى 3650");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user || user.role !== "USER") return fail("يمكن تعديل اشتراك مستخدم عادي فقط");
      if (mode === "revoke" && !user.isPro) return fail("لا يوجد اشتراك لإلغائه");
      if (mode === "days" && user.isPro && user.proUntil === null)
        return fail("الاشتراك دائم بالفعل");
      const base =
        user.isPro && user.proUntil && user.proUntil > new Date() ? user.proUntil : new Date();
      const proUntil = mode === "days" ? new Date(base.getTime() + days! * 86400000) : null;
      await tx.user.update({
        where: { id },
        data: { isPro: mode !== "revoke", proUntil },
      });
      await audit(
        tx,
        actor.id,
        mode === "revoke" ? "REVOKE_PRO" : "GRANT_PRO",
        `${id}; mode=${mode}; until=${proUntil?.toISOString() ?? "none"}`,
      );
      await notifyWithClient(
        tx,
        [id],
        "SYSTEM",
        mode === "revoke" ? "تم إيقاف عضوية برو" : "تم تحديث عضوية برو",
        mode === "revoke"
          ? "تم إيقاف عضوية برو على حسابك."
          : proUntil
            ? `عضويتك متاحة حتى ${proUntil.toLocaleDateString("ar-SA")}.`
            : "عضويتك أصبحت دائمة.",
        "/pro",
      );
      return ok("تم تحديث العضوية");
    },
    [id],
    "users.pro",
  );
}
export async function notifyUserAction(data: FormData) {
  const id = target(data),
    title = field(data, "title", 101),
    body = field(data, "body", 501),
    link = field(data, "link", 1000);
  if (
    title.length < 3 ||
    title.length > 100 ||
    body.length < 5 ||
    body.length > 500 ||
    !safeLink(link)
  )
    return fail("راجع طول العنوان والنص والرابط");
  return mutation(
    ["ADMIN", "MODERATOR", "SUPPORT"],
    async (tx, actor) => {
      const recipient = await tx.user.findUnique({ where: { id }, select: { role: true } });
      if (!recipient || (actor.role !== "ADMIN" && recipient.role !== "USER"))
        return fail("لا يمكن إرسال إشعار لهذا الحساب");
      const event = field(data, "requestId", 80) || randomBytes(16).toString("hex");
      await notifyWithClient(
        tx,
        [id],
        "ADMIN",
        title,
        body,
        link || undefined,
        `admin-notice:${actor.id}:${event}`,
      );
      await audit(tx, actor.id, "NOTIFY_USER", `${id}; ${title}`);
      return ok("حُفظ الإشعار وأُضيف الإرسال إلى الطابور");
    },
    [id],
    "users.notify",
  );
}
export async function toggleFeatureAction(data: FormData) {
  const id = field(data, "listingId");
  return mutation(
    ["ADMIN", "MODERATOR"],
    async (tx, actor) => {
      await lockListing(tx, id);
      const row = await tx.listing.findUnique({ where: { id } });
      if (!row || row.status !== "ACTIVE") return fail("يمكن تمييز إعلان نشط فقط");
      await tx.listing.update({
        where: { id },
        data: { isFeatured: !row.isFeatured, featuredUntil: null },
      });
      await audit(tx, actor.id, row.isFeatured ? "UNFEATURE_LISTING" : "FEATURE_LISTING", id);
      return ok();
    },
    [],
    "listings.manage",
  );
}
export async function removeListingAction(data: FormData) {
  const id = field(data, "listingId");
  return mutation(
    ["ADMIN", "MODERATOR"],
    async (tx, actor) => {
      await lockListing(tx, id);
      const row = await tx.listing.findUnique({ where: { id } });
      if (!row || row.status === "REMOVED") return fail("الإعلان غير موجود أو محذوف بالفعل");
      await tx.listing.update({
        where: { id },
        data: { status: "REMOVED", isFeatured: false, isPromoted: false },
      });
      await cancelListingAuction(tx, id);
      await tx.auction.updateMany({
        where: { listingId: id, status: "PENDING" },
        data: { status: "CANCELLED", reviewRemainingMs: null },
      });
      await tx.campaign.updateMany({
        where: { listingId: id, status: { in: ["ACTIVE", "PAUSED_REVIEW"] } },
        data: { status: "CANCELLED", endedAt: new Date(), reviewPausedAt: null },
      });
      await audit(tx, actor.id, "REMOVE_LISTING", `listing=${id}; from=${row.status}; to=REMOVED`);
      return ok("تم حذف الإعلان وإيقاف نشاطه المرتبط");
    },
    [],
    "listings.manage",
  );
}
export async function reviewListingAction(data: FormData) {
  const id = field(data, "listingId");
  const decision = field(data, "decision");
  const note = field(data, "note", 1000);
  const overrideProhibited = field(data, "overrideProhibited") === "yes";
  if (!["approve", "request_info", "reject"].includes(decision))
    return fail("قرار المراجعة غير صالح");
  if (decision !== "approve" && note.length < 10)
    return fail("اكتب سببًا واضحًا للبائع (10 أحرف على الأقل)");
  if (decision === "approve" && note.length < 10)
    return fail("اكتب ملاحظة المراجعة والأدلة التي تحققت منها");
  return mutation(
    ["ADMIN", "MODERATOR"],
    async (tx, actor) => {
      await lockListing(tx, id);
      const row = await tx.listing.findUnique({
        where: { id },
        include: {
          category: { include: { parent: true } },
          auction: { include: { _count: { select: { bids: true } } } },
        },
      });
      if (!row || !["PENDING", "AWAITING_INFO"].includes(row.status))
        return fail("الإعلان ليس في طابور المراجعة");
      if (decision === "approve" && row.status !== "PENDING")
        return fail("انتظر رد البائع قبل اعتماد الإعلان");
      let attributes: Record<string, string> = {};
      try {
        attributes = JSON.parse(row.attributes);
      } catch {}
      const currentRisk = classifyListing({
        title: row.title,
        description: row.description,
        categorySlug: row.category.slug,
        parentSlug: row.category.parent?.slug,
        categoryName: row.category.nameAr,
        attributes,
      });
      const prohibited = row.riskLevel === "PROHIBITED" || currentRisk.level === "PROHIBITED";
      if (decision === "approve" && prohibited && actor.role !== "ADMIN")
        return fail("الإعلانات ذات المحتوى المحظور المحتمل تحتاج قرار مدير النظام");
      if (decision === "approve" && prohibited && (!overrideProhibited || note.length < 30))
        return fail("يلزم تأكيد مدير النظام وسبب مفصل لتجاوز إشارة المحتوى المحظور");
      if (decision === "approve" && row.auction && row.auction._count.bids > 0)
        return fail("المزاد يحتوي مزايدات ولا يمكن إعادة تشغيله تلقائيًا");
      const now = new Date();
      const nextStatus =
        decision === "approve"
          ? "ACTIVE"
          : decision === "request_info"
            ? "AWAITING_INFO"
            : "REMOVED";
      await tx.listing.update({
        where: { id },
        data: {
          status: nextStatus,
          requestMessage: decision === "request_info" ? note : null,
          reviewedBy: actor.id,
          reviewedAt: now,
          ...(decision === "approve"
            ? { bumpedAt: now }
            : { isFeatured: false, isPromoted: false }),
        },
      });
      if (row.auction) {
        if (decision === "approve") {
          const originalHours = Math.round(
            (row.auction.endsAt.getTime() - row.createdAt.getTime()) / 3600000,
          );
          const durationHours = [24, 72, 120, 168].includes(originalHours) ? originalHours : 24;
          await tx.auction.update({
            where: { id: row.auction.id },
            data: {
              status: "LIVE",
              endsAt: new Date(
                now.getTime() + (row.auction.reviewRemainingMs ?? durationHours * 3600000),
              ),
              reviewRemainingMs: null,
            },
          });
        } else if (decision === "reject") {
          await tx.auction.update({
            where: { id: row.auction.id },
            data: { status: "CANCELLED", reviewRemainingMs: null },
          });
        }
      }
      if (decision === "approve") {
        const paused = await tx.campaign.findMany({
          where: { listingId: id, status: "PAUSED_REVIEW" },
        });
        for (const campaign of paused)
          await tx.campaign.update({
            where: { id: campaign.id },
            data: {
              status: "ACTIVE",
              reviewPausedAt: null,
              endsAt:
                campaign.endsAt && campaign.reviewPausedAt
                  ? new Date(
                      campaign.endsAt.getTime() + now.getTime() - campaign.reviewPausedAt.getTime(),
                    )
                  : campaign.endsAt,
            },
          });
        await tx.backgroundJob.upsert({
          where: { dedupKey: `listing:${id}` },
          create: {
            kind: "LISTING_ALERT",
            dedupKey: `listing:${id}`,
            payload: JSON.stringify({ listingId: id }),
          },
          update: {},
        });
      } else if (decision === "reject") {
        await tx.campaign.updateMany({
          where: { listingId: id, status: "PAUSED_REVIEW" },
          data: { status: "CANCELLED", endedAt: now, reviewPausedAt: null },
        });
      }
      await notifyWithClient(
        tx,
        [row.sellerId],
        "ADMIN",
        decision === "approve"
          ? "تم نشر إعلانك"
          : decision === "request_info"
            ? "نحتاج معلومات عن إعلانك"
            : "تعذر نشر إعلانك",
        decision === "approve" ? `تمت مراجعة إعلان «${row.title}» ونشره.` : note,
        decision === "approve"
          ? row.auction
            ? `/auctions/${row.auction.id}`
            : `/listings/${id}`
          : decision === "request_info"
            ? `/dashboard/listings/${id}/edit`
            : "/dashboard/listings",
      );
      await audit(
        tx,
        actor.id,
        `REVIEW_LISTING_${decision.toUpperCase()}`,
        `listing=${id}; from=${row.status}; to=${nextStatus}; risk=${row.riskLevel}; prohibited=${prohibited}; override=${overrideProhibited}; note=${note}`,
      );
      return ok(
        decision === "approve"
          ? "تم نشر الإعلان"
          : decision === "request_info"
            ? "تم طلب معلومات من البائع"
            : "تم رفض الإعلان",
      );
    },
    [],
    "listings.manage",
  );
}
/** Manual review of old, already-public ads. No bulk state changes. */
export async function reviewExistingListingAction(data: FormData) {
  const id = field(data, "listingId");
  const decision = field(data, "decision");
  const note = field(data, "note", 1000);
  const overrideProhibited = field(data, "overrideProhibited") === "yes";
  if (!["hold", "mark_reviewed", "reject"].includes(decision))
    return fail("قرار المراجعة غير صالح");
  if (note.length < 10) return fail("اكتب سبب القرار بوضوح (10 أحرف على الأقل)");
  return mutation(
    ["ADMIN", "MODERATOR"],
    async (tx, actor) => {
      await lockListing(tx, id);
      const row = await tx.listing.findUnique({
        where: { id },
        include: {
          category: { include: { parent: true } },
          auction: { include: { _count: { select: { bids: true, proxies: true } } } },
        },
      });
      if (!row || row.status !== "ACTIVE" || row.riskLevel === "NORMAL" || row.reviewedAt)
        return fail("الإعلان ليس ضمن قائمة المنشورات القديمة التي تحتاج مراجعة");
      if (
        decision === "hold" &&
        row.auction &&
        (row.auction._count.bids > 0 || row.auction._count.proxies > 0)
      )
        return fail(
          "لا يمكن تعليق مزاد بدأ عليه المزايدة؛ اتخذ قرار إزالة مع إخطار المزايدين عند الحاجة",
        );
      const now = new Date();
      if (
        decision === "hold" &&
        row.auction &&
        (row.auction.status !== "LIVE" || row.auction.endsAt <= now)
      )
        return fail("المزاد انتهى؛ انتظر تسوية حالته قبل نقله للمراجعة");
      let attributes: Record<string, string> = {};
      try {
        attributes = JSON.parse(row.attributes);
      } catch {}
      const currentRisk = classifyListing({
        title: row.title,
        description: row.description,
        categorySlug: row.category.slug,
        categoryName: row.category.nameAr,
        parentSlug: row.category.parent?.slug,
        attributes,
      });
      const prohibited = row.riskLevel === "PROHIBITED" || currentRisk.level === "PROHIBITED";
      if (
        decision === "mark_reviewed" &&
        prohibited &&
        (actor.role !== "ADMIN" || !overrideProhibited || note.length < 30)
      )
        return fail("توثيق سلامة إعلان يحمل إشارة محتوى محظور يتطلب مديرًا وسببًا مفصلًا");
      const nextStatus =
        decision === "mark_reviewed" ? "ACTIVE" : decision === "hold" ? "PENDING" : "REMOVED";
      if (decision === "hold" && row.auction?.status === "LIVE")
        await tx.auction.update({
          where: { id: row.auction.id },
          data: {
            status: "PENDING",
            reviewRemainingMs: Math.max(3600000, row.auction.endsAt.getTime() - now.getTime()),
          },
        });
      if (decision === "hold")
        await tx.campaign.updateMany({
          where: { listingId: id, status: "ACTIVE" },
          data: { status: "PAUSED_REVIEW", reviewPausedAt: now },
        });
      await tx.listing.update({
        where: { id },
        data: {
          status: nextStatus,
          reviewedBy: actor.id,
          reviewedAt: decision === "hold" ? null : now,
          ...(decision === "mark_reviewed" ? {} : { isFeatured: false, isPromoted: false }),
        },
      });
      if (decision === "reject") {
        await cancelListingAuction(tx, id);
        await tx.auction.updateMany({
          where: { listingId: id, status: "PENDING" },
          data: { status: "CANCELLED", reviewRemainingMs: null },
        });
        await tx.campaign.updateMany({
          where: { listingId: id, status: { in: ["ACTIVE", "PAUSED_REVIEW"] } },
          data: { status: "CANCELLED", endedAt: now, reviewPausedAt: null },
        });
      }
      if (decision !== "mark_reviewed")
        await notifyWithClient(
          tx,
          [row.sellerId],
          "ADMIN",
          decision === "hold" ? "إعلانك قيد المراجعة" : "تم إيقاف إعلانك",
          decision === "hold"
            ? `إعلان «${row.title}» قيد المراجعة حاليًا. سنخبرك بالقرار أو نطلب معلومات إضافية.`
            : note,
          "/dashboard/listings",
        );
      await audit(
        tx,
        actor.id,
        `REVIEW_EXISTING_${decision.toUpperCase()}`,
        `listing=${id}; from=ACTIVE; to=${nextStatus}; risk=${row.riskLevel}; prohibited=${prohibited}; override=${overrideProhibited}; note=${note}`,
      );
      return ok(
        decision === "mark_reviewed"
          ? "تم توثيق المراجعة وبقي الإعلان منشورًا"
          : decision === "hold"
            ? "نُقل الإعلان للمراجعة وأُبلغ البائع"
            : "أُوقف الإعلان وأُبلغ البائع",
      );
    },
    [],
    "listings.manage",
  );
}
export async function restoreListingAction(data: FormData) {
  const id = field(data, "listingId");
  return mutation(
    ["ADMIN", "MODERATOR"],
    async (tx, actor) => {
      await lockListing(tx, id);
      const row = await tx.listing.findUnique({
        where: { id },
        include: { auction: true, category: { include: { parent: true } } },
      });
      if (!row || row.status !== "REMOVED") return fail("يمكن استرجاع إعلان محذوف فقط");
      if (row.auction)
        return fail(
          "المزاد الملغى لا يُسترجع تلقائيًا حفاظًا على المزايدات؛ اطلب من البائع إنشاء مزاد جديد",
        );
      if (row.expiresAt && row.expiresAt <= new Date())
        return fail("الإعلان منتهي؛ يلزم تجديده قبل إعادة نشره");
      let attributes: Record<string, string> = {};
      try {
        attributes = JSON.parse(row.attributes);
      } catch {}
      let review = classifyListing({
        title: row.title,
        description: row.description,
        categorySlug: row.category.slug,
        parentSlug: row.category.parent?.slug,
        categoryName: row.category.nameAr,
        attributes,
      });
      if (
        await findBannedWord(
          `${row.title} ${row.description} ${Object.values(attributes).join(" ")}`,
        )
      )
        review = addReviewReason(review, "PROHIBITED", "BANNED_WORD", "قائمة محظورات الإدارة");
      await tx.listing.update({
        where: { id },
        data: {
          status: review.level === "NORMAL" ? "ACTIVE" : "PENDING",
          riskLevel: review.level,
          riskReasons: JSON.stringify(review.reasons),
          riskSignals: JSON.stringify(review.signals),
          reviewedBy: null,
          reviewedAt: null,
          isFeatured: false,
          isPromoted: false,
        },
      });
      await audit(
        tx,
        actor.id,
        "RESTORE_LISTING",
        `listing=${id}; from=REMOVED; to=${review.level === "NORMAL" ? "ACTIVE" : "PENDING"}; cancelled campaigns remain cancelled`,
      );
      return ok(
        review.level === "NORMAL"
          ? "تم استرجاع الإعلان دون إعادة تشغيل الحملات الملغاة"
          : "استعيد الإعلان إلى طابور المراجعة",
      );
    },
    [],
    "listings.manage",
  );
}
export async function resolveDisputeAction(data: FormData) {
  const actor = await requireStaff(["ADMIN", "SUPPORT"], "disputes.resolve"),
    favor = field(data, "favor"),
    resolution = field(data, "resolution", 2001);
  if (!["SELLER", "BUYER"].includes(favor) || resolution.length < 5 || resolution.length > 2000)
    return fail("حدد الطرف واكتب سبب القرار (5–2000 حرف)");
  const result = await resolveDispute(
    field(data, "disputeId"),
    favor as "SELLER" | "BUYER",
    resolution,
    actor.id,
    actor.sessionVersion,
  );
  revalidatePath("/admin/disputes");
  return result ? ok("تم اعتماد القرار") : fail("النزاع حُسم مسبقًا أو غير موجود");
}

const POSITIONS = ["HOME_TOP", "HOME_MIDDLE"];
function bannerInput(data: FormData) {
  const title = field(data, "title", 121),
    imageUrl = field(data, "imageUrl", 1000) || null,
    mobileImageUrl = field(data, "mobileImageUrl", 1000) || null,
    linkUrl = field(data, "linkUrl", 1000) || null,
    embedInput = field(data, "embedHtml", 5000),
    embedHtml = embedInput ? safeBannerEmbedUrl(embedInput) : null,
    position = field(data, "position");
  if (
    title.length < 2 ||
    title.length > 120 ||
    !POSITIONS.includes(position) ||
    (!imageUrl && !embedHtml) ||
    (embedInput && !embedHtml) ||
    !safeLink(linkUrl ?? "") ||
    (imageUrl && !safeLink(imageUrl)) ||
    (mobileImageUrl && !safeLink(mobileImageUrl))
  )
    return null;
  return { title, imageUrl, mobileImageUrl, linkUrl, embedHtml, position };
}
export async function createBannerAction(data: FormData) {
  const input = bannerInput(data);
  if (!input) return fail("راجع العنوان والموضع والصور؛ التضمين يدعم YouTube وVimeo وTikTok فقط");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const row = await tx.banner.create({ data: input });
      await audit(tx, actor.id, "CREATE_BANNER", `${row.id}; ${input.title}`);
      return ok("تم نشر البانر");
    },
    [],
    "banners.manage",
  );
}
export async function updateBannerAction(data: FormData) {
  const input = bannerInput(data),
    id = field(data, "bannerId");
  if (!input) return fail("راجع بيانات البانر والموضع المدعوم");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      if (!(await tx.banner.count({ where: { id } }))) return fail("البانر غير موجود");
      await tx.banner.update({ where: { id }, data: input });
      await audit(tx, actor.id, "UPDATE_BANNER", id);
      return ok("تم تحديث البانر مع الاحتفاظ بإحصاءاته");
    },
    [],
    "banners.manage",
  );
}
export async function toggleBannerAction(data: FormData) {
  const id = field(data, "bannerId");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      await tx.$queryRaw`SELECT id FROM "Banner" WHERE id=${id} FOR UPDATE`;
      const row = await tx.banner.findUnique({ where: { id } });
      if (!row) return fail("البانر غير موجود");
      if (!POSITIONS.includes(row.position) && row.status !== "ACTIVE")
        return fail("عدل موضع البانر إلى موضع مدعوم أولًا");
      await tx.banner.update({
        where: { id },
        data: { status: row.status === "ACTIVE" ? "DISABLED" : "ACTIVE" },
      });
      await audit(tx, actor.id, "TOGGLE_BANNER", id);
      return ok();
    },
    [],
    "banners.manage",
  );
}
export async function deleteBannerAction(data: FormData) {
  const id = field(data, "bannerId");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const deleted = await tx.banner.deleteMany({ where: { id } });
      if (!deleted.count) return fail("البانر غير موجود");
      await audit(tx, actor.id, "DELETE_BANNER", id);
      return ok("تم حذف البانر");
    },
    [],
    "banners.manage",
  );
}
export async function closeReportAction(data: FormData) {
  const id = field(data, "reportId"),
    outcome = field(data, "outcome");
  if (!["RESOLVED", "DISMISSED"].includes(outcome)) return fail();
  return mutation(
    ["ADMIN", "MODERATOR", "SUPPORT"],
    async (tx, actor) => {
      const changed = await tx.report.updateMany({
        where: { id, status: "OPEN" },
        data: { status: outcome, resolvedAt: new Date() },
      });
      if (!changed.count) return fail("البلاغ مغلق بالفعل أو غير موجود");
      await audit(tx, actor.id, `REPORT_${outcome}`, id);
      return ok("تم تحديث البلاغ");
    },
    [],
    "reports.manage",
  );
}
export async function hideCommentAction(data: FormData) {
  const id = field(data, "commentId");
  return mutation(
    ["ADMIN", "MODERATOR", "SUPPORT"],
    async (tx, actor) => {
      await tx.$queryRaw`SELECT id FROM "Comment" WHERE id=${id} FOR UPDATE`;
      const row = await tx.comment.findUnique({ where: { id } });
      if (!row) return fail("التعليق غير موجود");
      await tx.comment.update({
        where: { id },
        data: { isHidden: !row.isHidden },
      });
      await audit(tx, actor.id, row.isHidden ? "UNHIDE_COMMENT" : "HIDE_COMMENT", id);
      return ok();
    },
    [],
    "reports.manage",
  );
}

export async function updatePlanAction(data: FormData) {
  const id = field(data, "planId"),
    name = field(data, "name", 101),
    price = integer(data, "price", 0, 100000),
    maxListings = integer(data, "maxListings", 0, 100000),
    maxAuctions = integer(data, "maxAuctions", 0, 100000),
    maxStores = integer(data, "maxStores", 0, 10000),
    dailyPoints = integer(data, "dailyPoints", 0, 100000);
  const featuresEn = field(data, "featuresEn", 5000)
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  const features = field(data, "features", 5000)
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  if (
    name.length < 2 ||
    name.length > 100 ||
    [price, maxListings, maxAuctions, maxStores, dailyPoints].includes(null) ||
    features.length > 30 ||
    featuresEn.length > 30
  )
    return fail("راجع الأعداد الصحيحة غير السالبة وحدود الباقة");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const plan = await tx.plan.findUnique({ where: { id } });
      if (!plan || !["FREE", "PRO_MONTHLY"].includes(plan.key))
        return fail("الحدود الفعلية تدعم FREE وPRO_MONTHLY فقط");
      await tx.plan.update({
        where: { id },
        data: {
          name,
          price: price!,
          period: field(data, "period", 80),
          nameEn: field(data, "nameEn", 100),
          periodEn: field(data, "periodEn", 80),
          featuresEn: JSON.stringify(featuresEn),
          maxListings: maxListings!,
          maxAuctions: maxAuctions!,
          maxStores: maxStores!,
          dailyPoints: dailyPoints!,
          features: JSON.stringify(features),
          highlight: data.has("highlight"),
          isActive: true,
        },
      });
      await audit(
        tx,
        actor.id,
        "UPDATE_PLAN",
        `${id}; price=${price}; limits=${maxListings}/${maxAuctions}/${maxStores}; daily=${dailyPoints}`,
      );
      return ok("تم تحديث الباقة المدعومة");
    },
    [],
    "plans.manage",
  );
}
export async function createPlanAction() {
  await requireStaff(["ADMIN"]);
  return fail("إضافة باقات مستقلة غير متاحة حتى تفعيل نظام اشتراكات مرتبط بالباقة");
}
export async function deletePlanAction(data: FormData) {
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const id = field(data, "planId"),
        row = await tx.plan.findUnique({ where: { id } });
      if (!row || ["FREE", "PRO_MONTHLY"].includes(row.key))
        return fail("لا يمكن حذف الباقات الأساسية");
      await tx.plan.delete({ where: { id } });
      await audit(tx, actor.id, "DELETE_PLAN", id);
      return ok();
    },
    [],
    "plans.manage",
  );
}
export async function savePointPackageAction(data: FormData) {
  const id = field(data, "packageId"),
    points = integer(data, "points", 1, 1000000),
    bonus = integer(data, "bonus", 0, 1000000, 0),
    price = integer(data, "price", 1, 100000);
  if (points === null || bonus === null || price === null)
    return fail("النقاط والهدية أعداد صحيحة غير سالبة والسعر من 1 إلى 100000");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const values = {
        points,
        bonus,
        price,
        isActive: id ? data.has("isActive") : true,
      };
      if (id) {
        if (!(await tx.pointPackage.count({ where: { id } }))) return fail("الباقة غير موجودة");
        await tx.pointPackage.update({ where: { id }, data: values });
      } else
        await tx.pointPackage.create({
          data: { ...values, sortOrder: await tx.pointPackage.count() },
        });
      await audit(
        tx,
        actor.id,
        id ? "UPDATE_POINT_PKG" : "CREATE_POINT_PKG",
        `${id || "new"}; points=${points}; bonus=${bonus}; price=${price}`,
      );
      return ok();
    },
    [],
    "points.manage",
  );
}
export async function deletePointPackageAction(data: FormData) {
  const id = field(data, "packageId");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const row = await tx.pointPackage.findUnique({ where: { id } });
      if (!row) return fail("الباقة غير موجودة");
      const used = await tx.payment.count({ where: { packageId: id } });
      if (used) {
        await tx.pointPackage.update({
          where: { id },
          data: { isActive: false },
        });
        await audit(tx, actor.id, "ARCHIVE_POINT_PKG", id);
        return ok("الباقة مرتبطة بمدفوعات؛ تم تعطيلها وحفظ السجل");
      }
      await tx.pointPackage.delete({ where: { id } });
      await audit(tx, actor.id, "DELETE_POINT_PKG", id);
      return ok();
    },
    [],
    "points.manage",
  );
}

export async function requestStaffChangeCodeAction() {
  const actor = await requireStaff(["ADMIN"]);
  const sent = await startOtpChallenge(actor, "ADMIN_STAFF_CHANGE");
  return sent.ok
    ? {
        ok: true,
        message: "أرسلنا إلى بريدك رمز تأكيد إدارة الفريق والصلاحيات",
        challenge: sent.challenge,
      }
    : fail(sent.error);
}

export async function createStaffAction(data: FormData) {
  const name = field(data, "name", 101),
    email = field(data, "email", 255).toLowerCase(),
    role = field(data, "role"),
    permissions = selectedStaffPermissions(data.getAll("permissions"));
  if (
    name.length < 2 ||
    name.length > 100 ||
    !z.email().max(254).safeParse(email).success ||
    !["ADMIN", "MODERATOR", "SUPPORT", "ACCOUNTANT", "STAFF"].includes(role) ||
    permissions === null ||
    (role === "STAFF" && permissions.length === 0) ||
    (role !== "STAFF" && permissions.length > 0)
  )
    return fail("راجع الاسم والبريد والدور والصلاحيات المحددة");
  const exists = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  const result = await mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const row = await tx.user.findUnique({ where: { email } });
      if (row) {
        if (row.role !== "USER")
          return fail("هذا البريد موظف بالفعل؛ استخدم تعديل الدور أو إعادة الدعوة");
        if (row.isBanned) return fail("ارفع حظر المستخدم قبل ترقيته");
        await tx.user.update({
          where: { id: row.id },
          data: {
            role,
            staffPermissions: JSON.stringify(permissions),
            sessionVersion: { increment: 1 },
          },
        });
        await tx.loginOtp.deleteMany({ where: { userId: row.id } });
        await audit(
          tx,
          actor.id,
          "PROMOTE_STAFF",
          `${row.id} → ${role}; permissions=${permissions.join(",")}`,
        );
      } else {
        const newUser = await tx.user.create({
          data: {
            name,
            email,
            city: "الرياض",
            role,
            staffPermissions: JSON.stringify(permissions),
            passwordHash: await hash(randomBytes(32).toString("hex"), 12),
            passwordEnabled: false,
            credibility: 100,
          },
        });
        await audit(
          tx,
          actor.id,
          "CREATE_STAFF",
          `${newUser.id}; role=${role}; permissions=${permissions.join(",")}`,
        );
      }
      return ok(
        row
          ? `تمت ترقية الحساب برتبة ${ROLE_LABELS[role]}`
          : `تم إنشاء الحساب برتبة ${ROLE_LABELS[role]}`,
      );
    },
    exists ? [exists.id] : [],
    undefined,
    staffProof(data),
  );
  if (!result.ok) return result;
  const invited = await db.user.findUnique({ where: { email } });
  const sent =
    invited && !invited.isBanned && STAFF_ROLES.includes(invited.role)
      ? await sendInvite(invited)
      : false;
  return {
    ...result,
    message: `${result.message}. ${sent ? "أُرسلت الدعوة" : "تعذّر إرسال الدعوة؛ أعد إرسالها من قائمة الفريق"}`,
  };
}
async function sendInvite(user: Pick<User, "email" | "name" | "role" | "passwordEnabled">) {
  const origin = process.env.ADMIN_HOST
    ? `https://${process.env.ADMIN_HOST}`
    : (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  const portal = new URL("/admin-login", origin).href;
  return sendEmail({ to: user.email, ...staffInviteTemplate(user, portal) });
}
export async function resendStaffInviteAction(data: FormData) {
  await requireStaff(["ADMIN"]);
  const user = await db.user.findUnique({ where: { id: target(data) } });
  if (!user || user.role === "USER" || user.isBanned) return fail("اختر موظفًا نشطًا");
  return (await sendInvite(user))
    ? ok("أُرسلت الدعوة")
    : fail("تعذّر الإرسال أو وصلت إلى حد الرسائل؛ حاول لاحقًا");
}
export async function updateStaffRoleAction(data: FormData) {
  const id = target(data),
    role = field(data, "role");
  if (!["ADMIN", "MODERATOR", "SUPPORT", "ACCOUNTANT"].includes(role)) return fail();
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const row = await tx.user.findUnique({ where: { id } });
      if (!row || row.role === "USER" || id === actor.id) return fail("لا يمكن تغيير هذا الدور");
      if (row.role === role) return fail("الدور لم يتغير");
      await tx.user.update({
        where: { id },
        data: { role, staffPermissions: "[]", sessionVersion: { increment: 1 } },
      });
      await tx.loginOtp.deleteMany({ where: { userId: id } });
      await audit(tx, actor.id, "UPDATE_STAFF_ROLE", `${id}: ${row.role} → ${role}`);
      return ok();
    },
    [id],
    undefined,
    staffProof(data),
  );
}
export async function updateStaffPermissionsAction(data: FormData) {
  const id = target(data);
  const permissions = selectedStaffPermissions(data.getAll("permissions"));
  if (!permissions?.length) return fail("اختر صلاحية واحدة على الأقل من القائمة");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const row = await tx.user.findUnique({ where: { id } });
      if (!row || row.role === "USER" || row.role === "ADMIN" || id === actor.id || row.isBanned)
        return fail("لا يمكن تخصيص صلاحيات هذا الحساب");
      const before = row.role === "STAFF" ? row.staffPermissions : row.role;
      await tx.user.update({
        where: { id },
        data: {
          role: "STAFF",
          staffPermissions: JSON.stringify(permissions),
          sessionVersion: { increment: 1 },
        },
      });
      await tx.loginOtp.deleteMany({ where: { userId: id } });
      await audit(
        tx,
        actor.id,
        "UPDATE_STAFF_PERMISSIONS",
        `user=${id}; from=${before}; to=${permissions.join(",")}`,
      );
      return ok("تم حفظ الصلاحيات وإلغاء جلسات الموظف القديمة");
    },
    [id],
    undefined,
    staffProof(data),
  );
}
export async function removeStaffAction(data: FormData) {
  const id = target(data);
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const row = await tx.user.findUnique({ where: { id } });
      if (!row || row.role === "USER" || id === actor.id) return fail("لا يمكن إزالة هذا الموظف");
      await tx.user.update({
        where: { id },
        data: { role: "USER", staffPermissions: "[]", sessionVersion: { increment: 1 } },
      });
      await tx.loginOtp.deleteMany({ where: { userId: id } });
      await audit(tx, actor.id, "REMOVE_STAFF", `${id}; previous=${row.role}`);
      return ok("تمت إزالة صلاحيات الموظف");
    },
    [id],
    undefined,
    staffProof(data),
  );
}
export async function updateMyAccountAction(data: FormData) {
  return updateAccountAction(data);
}
export async function setMyPasswordAction(data: FormData) {
  return changeAccountPasswordAction(data);
}

export async function saveSettingsAction(data: FormData) {
  const keys = ["CAMPAIGN_POINTS_PER_DAY", "FEATURE_POINT_COST", "BUMP_POINT_COST"] as const;
  const values = keys.map((key) => integer(data, key, 0, 100000));
  const hours = integer(data, "BUMP_FREE_HOURS", 1, 720);
  const raw = field(data, "CAMPAIGN_DAY_OPTIONS", 500)
    .split(/[,\s،]+/)
    .filter(Boolean);
  const days = [...new Set(raw.map(Number))].sort((a, b) => a - b);
  if (
    values.includes(null) ||
    hours === null ||
    !days.length ||
    days.some((n) => !Number.isInteger(n) || n < 1 || n > 365)
  )
    return fail("راجع تكاليف الخدمات والمدد؛ لم تُحفظ أي قيمة");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      for (let i = 0; i < keys.length; i++) await setting(tx, keys[i], String(values[i]));
      await setting(tx, "BUMP_FREE_HOURS", String(hours));
      await setting(tx, "CAMPAIGN_DAY_OPTIONS", days.join(","));
      await setting(tx, "TOPUP_ENABLED", data.has("TOPUP_ENABLED") ? "1" : "0");
      await setting(tx, "TOPUP_DISABLED_MESSAGE", field(data, "TOPUP_DISABLED_MESSAGE", 300));
      await audit(
        tx,
        actor.id,
        "UPDATE_SETTINGS",
        `costs=${values}; hours=${hours}; days=${days}; topup=${data.has("TOPUP_ENABLED")}`,
      );
      return ok("حُفظت الإعدادات لجميع عمليات التشغيل");
    },
    [],
    "points.manage",
  );
}
export async function saveSocialLinksAction(data: FormData) {
  const keys = ["SOCIAL_INSTAGRAM", "SOCIAL_FACEBOOK", "SOCIAL_SNAPCHAT"];
  const values = keys.map((key) => field(data, key, 1000));
  if (values.some((v) => v && (!v.startsWith("https://") || !safeLink(v))))
    return fail("الروابط الاجتماعية يجب أن تكون HTTPS صالحة");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      for (let i = 0; i < keys.length; i++) await setting(tx, keys[i], values[i]);
      await audit(tx, actor.id, "UPDATE_SOCIAL_LINKS", "footer links updated");
      return ok();
    },
    [],
    "banners.manage",
  );
}
export async function toggleHomeStatsAction() {
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const row = await tx.setting.findUnique({
          where: { key: "HOME_STATS_VISIBLE" },
        }),
        visible = (row?.value ?? "1") === "1";
      await setting(tx, "HOME_STATS_VISIBLE", visible ? "0" : "1");
      await audit(tx, actor.id, "TOGGLE_HOME_STATS", String(!visible));
      return ok();
    },
    [],
    "banners.manage",
  );
}
export async function saveContactInfoAction(data: FormData) {
  const email = field(data, "CONTACT_EMAIL", 254),
    phone = field(data, "CONTACT_PHONE", 30),
    whatsapp = field(data, "CONTACT_WHATSAPP", 30),
    hours = field(data, "CONTACT_HOURS", 120);
  if (
    (email && !z.email().safeParse(email).success) ||
    (phone && !/^[+\d\s()-]{5,30}$/.test(phone)) ||
    (whatsapp && !/^\+?[\d\s-]{8,25}$/.test(whatsapp))
  )
    return fail("راجع بريد التواصل والهاتف والواتساب");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      for (const [key, value] of Object.entries({
        CONTACT_EMAIL: email,
        CONTACT_PHONE: phone,
        CONTACT_WHATSAPP: whatsapp,
        CONTACT_HOURS: hours,
      }))
        await setting(tx, key, value);
      await audit(tx, actor.id, "UPDATE_CONTACT_INFO", "Contact information validated");
      return ok();
    },
    [],
    "banners.manage",
  );
}
export async function saveFreeTierAction(data: FormData) {
  const days = integer(data, "days", 1, 365);
  if (days === null) return fail("المدة من 1 إلى 365 يومًا");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      await setting(tx, "FREE_TIER_ENABLED", data.has("enabled") ? "1" : "0");
      await setting(tx, "FREE_TIER_DAYS", String(days));
      await audit(tx, actor.id, "UPDATE_FREE_TIER", `enabled=${data.has("enabled")}; days=${days}`);
      return ok();
    },
    [],
    "plans.manage",
  );
}
export async function saveReferralSettingsAction(data: FormData) {
  const percent = integer(data, "percent", 0, 100);
  if (percent === null) return fail("النسبة عدد صحيح من 0 إلى 100");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      await setting(tx, "REFERRAL_ENABLED", data.has("enabled") ? "1" : "0");
      await setting(tx, "REFERRAL_PERCENT", String(percent));
      await audit(
        tx,
        actor.id,
        "UPDATE_REFERRAL",
        `enabled=${data.has("enabled")}; percent=${percent}`,
      );
      return ok();
    },
    [],
    "promos.manage",
  );
}
export async function createPromoCodeAction(data: FormData) {
  const code = field(data, "code", 31).toUpperCase(),
    percent = integer(data, "percent", 1, 100),
    maxUses = integer(data, "maxUses", 0, 1000000, 0),
    raw = field(data, "expiresAt", 30),
    expiresAt = raw ? new Date(raw) : null;
  if (
    !/^[A-Z0-9-]{3,30}$/.test(code) ||
    percent === null ||
    maxUses === null ||
    (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()))
  )
    return fail("راجع الكود والنسبة والحد وتاريخ انتهاء مستقبلي");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const created = await tx.promoCode.createMany({
        data: [
          {
            code,
            percent,
            maxUses,
            oncePerUser: data.has("oncePerUser"),
            expiresAt,
          },
        ],
        skipDuplicates: true,
      });
      if (!created.count) return fail("الكود موجود بالفعل؛ لم تتغير بياناته");
      await audit(tx, actor.id, "CREATE_PROMO", `${code}; percent=${percent}; maxUses=${maxUses}`);
      return ok();
    },
    [],
    "promos.manage",
  );
}
export async function togglePromoCodeAction(data: FormData) {
  const id = field(data, "promoId");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      await tx.$queryRaw`SELECT id FROM "PromoCode" WHERE id=${id} FOR UPDATE`;
      const row = await tx.promoCode.findUnique({ where: { id } });
      if (!row) return fail("الكود غير موجود");
      await tx.promoCode.update({
        where: { id },
        data: { isActive: !row.isActive },
      });
      await audit(tx, actor.id, "TOGGLE_PROMO", `${id}; active=${!row.isActive}`);
      return ok();
    },
    [],
    "promos.manage",
  );
}
export async function deletePromoCodeAction(data: FormData) {
  const id = field(data, "promoId");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const row = await tx.promoCode.findUnique({ where: { id } });
      if (!row) return fail("الكود غير موجود");
      if (row.usedCount || (await tx.payment.count({ where: { promoCodeId: id } }))) {
        await tx.promoCode.update({ where: { id }, data: { isActive: false } });
        await audit(tx, actor.id, "ARCHIVE_PROMO", id);
        return ok("تم تعطيل الكود والاحتفاظ بسجل الاستخدام والمدفوعات");
      }
      await tx.promoCode.delete({ where: { id } });
      await audit(tx, actor.id, "DELETE_PROMO", id);
      return ok();
    },
    [],
    "promos.manage",
  );
}
export async function addBannedWordAction(data: FormData) {
  const word = normalizeArabic(field(data, "word", 101));
  if (word.length < 2 || word.length > 100) return fail("الكلمة من 2 إلى 100 حرف");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const created = await tx.bannedWord.createMany({
        data: [{ word }],
        skipDuplicates: true,
      });
      if (!created.count) return fail("الكلمة موجودة بالفعل");
      await audit(tx, actor.id, "ADD_BANNED_WORD", word);
      return ok();
    },
    [],
    "moderation.manage",
  );
}
export async function deleteBannedWordAction(data: FormData) {
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const id = field(data, "wordId"),
        changed = await tx.bannedWord.deleteMany({ where: { id } });
      if (!changed.count) return fail("الكلمة غير موجودة");
      await audit(tx, actor.id, "DELETE_BANNED_WORD", id);
      return ok();
    },
    [],
    "moderation.manage",
  );
}
export async function broadcastAction(data: FormData) {
  const title = field(data, "title", 101),
    body = field(data, "body", 501),
    link = field(data, "link", 1000),
    event = field(data, "requestId", 80);
  if (
    title.length < 3 ||
    title.length > 100 ||
    body.length < 5 ||
    body.length > 500 ||
    !safeLink(link) ||
    !/^[a-zA-Z0-9-]{16,80}$/.test(event)
  )
    return fail("راجع العنوان والنص والرابط، وأعد فتح نموذج الإرسال");
  return mutation(
    ["ADMIN"],
    async (tx, actor) => {
      const key = `broadcast:${actor.id}:${event}`;
      if (await tx.backgroundJob.count({ where: { dedupKey: key } }))
        return ok("هذا الإرسال مسجل بالفعل؛ لا حاجة لتكراره");
      const upper = await tx.user.findFirst({
        orderBy: { id: "desc" },
        select: { id: true },
      });
      await tx.backgroundJob.create({
        data: {
          kind: "BROADCAST",
          dedupKey: key,
          payload: JSON.stringify({
            event: key,
            cursor: "",
            upper: upper?.id ?? "",
            title,
            body,
            link: link || undefined,
          }),
        },
      });
      await audit(tx, actor.id, "BROADCAST_QUEUED", `${key}; ${title}`);
      return ok("سُجل الإرسال الجماعي؛ ينفذ على دفعات دون انتظار مزود الإشعارات");
    },
    [],
    "moderation.manage",
  );
}
