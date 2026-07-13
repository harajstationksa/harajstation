"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { applyCredibility, resolveDispute } from "@/lib/credibility";
import { adjustPoints } from "@/lib/points";
import { setSetting } from "@/lib/settings";

async function audit(actorId: string, action: string, detail: string) {
  await db.auditLog.create({ data: { actorId, action, detail } });
}

export async function toggleBanAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN", "MODERATOR"]);
  const userId = String(formData.get("userId"));
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role === "ADMIN") return;
  await db.user.update({
    where: { id: userId },
    data: { isBanned: !user.isBanned },
  });
  await audit(
    staff.id,
    user.isBanned ? "UNBAN_USER" : "BAN_USER",
    `${user.name} (${user.phone})`
  );
  revalidatePath("/admin/users");
}

export async function adjustCredibilityAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN", "SUPPORT"]);
  const userId = String(formData.get("userId"));
  const delta = Number(formData.get("delta"));
  const reason = String(formData.get("reason") || "تعديل إداري");
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 50) return;
  await applyCredibility(userId, delta, `${reason} (بواسطة ${staff.name})`);
  await audit(staff.id, "ADJUST_CREDIBILITY", `${userId}: ${delta > 0 ? "+" : ""}${delta} — ${reason}`);
  revalidatePath("/admin/users");
}

export async function toggleFeatureAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN", "MODERATOR"]);
  const id = String(formData.get("listingId"));
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) return;
  await db.listing.update({
    where: { id },
    data: { isFeatured: !listing.isFeatured },
  });
  await audit(staff.id, listing.isFeatured ? "UNFEATURE_LISTING" : "FEATURE_LISTING", listing.title);
  revalidatePath("/admin/listings");
}

export async function removeListingAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN", "MODERATOR"]);
  const id = String(formData.get("listingId"));
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) return;
  await db.listing.update({ where: { id }, data: { status: "REMOVED" } });
  await audit(staff.id, "REMOVE_LISTING", listing.title);
  revalidatePath("/admin/listings");
}

export async function restoreListingAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN", "MODERATOR"]);
  const id = String(formData.get("listingId"));
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) return;
  await db.listing.update({ where: { id }, data: { status: "ACTIVE" } });
  await audit(staff.id, "RESTORE_LISTING", listing.title);
  revalidatePath("/admin/listings");
}

export async function resolveDisputeAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN", "SUPPORT"]);
  const disputeId = String(formData.get("disputeId"));
  const favor = String(formData.get("favor"));
  const resolution = String(formData.get("resolution") || "").trim();
  if (favor !== "SELLER" && favor !== "BUYER") return;
  if (resolution.length < 5) return;
  await resolveDispute(disputeId, favor, resolution, staff.id);
  revalidatePath("/admin/disputes");
}

export async function createBannerAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const title = String(formData.get("title") || "").trim();
  const imageUrl = String(formData.get("imageUrl") || "").trim() || null;
  const linkUrl = String(formData.get("linkUrl") || "").trim() || null;
  const embedHtml = String(formData.get("embedHtml") || "").trim() || null;
  const position = String(formData.get("position") || "HOME_TOP");
  if (!title || (!imageUrl && !embedHtml)) return;
  await db.banner.create({ data: { title, imageUrl, linkUrl, embedHtml, position } });
  await audit(staff.id, "CREATE_BANNER", title);
  revalidatePath("/admin/banners");
  revalidatePath("/");
}

export async function toggleBannerAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const id = String(formData.get("bannerId"));
  const banner = await db.banner.findUnique({ where: { id } });
  if (!banner) return;
  await db.banner.update({
    where: { id },
    data: { status: banner.status === "ACTIVE" ? "DISABLED" : "ACTIVE" },
  });
  await audit(staff.id, "TOGGLE_BANNER", `${banner.title} → ${banner.status === "ACTIVE" ? "معطل" : "نشط"}`);
  revalidatePath("/admin/banners");
  revalidatePath("/");
}

export async function deleteBannerAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const id = String(formData.get("bannerId"));
  const banner = await db.banner.delete({ where: { id } }).catch(() => null);
  if (banner) await audit(staff.id, "DELETE_BANNER", banner.title);
  revalidatePath("/admin/banners");
  revalidatePath("/");
}

export async function closeReportAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN", "MODERATOR", "SUPPORT"]);
  const id = String(formData.get("reportId"));
  const outcome = String(formData.get("outcome")); // RESOLVED | DISMISSED
  if (outcome !== "RESOLVED" && outcome !== "DISMISSED") return;
  await db.report.update({
    where: { id },
    data: { status: outcome, resolvedAt: new Date() },
  });
  await audit(staff.id, `REPORT_${outcome}`, id);
  revalidatePath("/admin/reports");
}

export async function hideCommentAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN", "MODERATOR", "SUPPORT"]);
  const id = String(formData.get("commentId"));
  const comment = await db.comment.findUnique({ where: { id } });
  if (!comment) return;
  await db.comment.update({
    where: { id },
    data: { isHidden: !comment.isHidden },
  });
  await audit(staff.id, comment.isHidden ? "UNHIDE_COMMENT" : "HIDE_COMMENT", id);
  revalidatePath("/admin/reports");
}

/** Give or take points from a user (admin/support), logged to the ledger. */
export async function adjustUserPointsAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN", "SUPPORT"]);
  const userId = String(formData.get("userId"));
  const delta = Number(formData.get("delta"));
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) return;
  await adjustPoints(userId, delta, `تعديل إداري (بواسطة ${staff.name})`);
  await audit(staff.id, "ADJUST_POINTS", `${userId}: ${delta > 0 ? "+" : ""}${delta}`);
  revalidatePath("/admin/users");
}

export async function updatePlanAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const id = String(formData.get("planId"));
  const name = String(formData.get("name") || "").trim();
  const price = Number(formData.get("price"));
  const period = String(formData.get("period") || "").trim();
  const maxListings = Number(formData.get("maxListings"));
  const maxAuctions = Number(formData.get("maxAuctions"));
  const maxStores = Number(formData.get("maxStores"));
  const dailyPoints = Number(formData.get("dailyPoints"));
  const features = String(formData.get("features") || "")
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  if (!name || !Number.isFinite(price) || price < 0) return;
  await db.plan.update({
    where: { id },
    data: {
      name,
      price: Math.round(price),
      period,
      maxListings: Number.isInteger(maxListings) ? maxListings : undefined,
      maxAuctions: Number.isInteger(maxAuctions) ? maxAuctions : undefined,
      maxStores: Number.isInteger(maxStores) ? maxStores : undefined,
      dailyPoints: Number.isInteger(dailyPoints) ? dailyPoints : undefined,
      features: JSON.stringify(features),
      highlight: formData.get("highlight") != null,
      isActive: formData.get("isActive") != null,
    },
  });
  await audit(staff.id, "UPDATE_PLAN", `${name} — ${price} ر.س`);
  revalidatePath("/admin/plans");
  revalidatePath("/pro");
}

export async function createPlanAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const name = String(formData.get("name") || "").trim();
  const price = Number(formData.get("price"));
  if (!name || !Number.isFinite(price) || price < 0) return;
  const count = await db.plan.count();
  await db.plan.create({
    data: {
      key: `PLAN_${Date.now()}`,
      name,
      price: Math.round(price),
      period: String(formData.get("period") || "").trim(),
      maxListings: Number(formData.get("maxListings")) || 10,
      maxAuctions: Number(formData.get("maxAuctions")) || 3,
      maxStores: Number(formData.get("maxStores")) || 1,
      dailyPoints: Number(formData.get("dailyPoints")) || 5,
      sortOrder: count,
    },
  });
  await audit(staff.id, "CREATE_PLAN", name);
  revalidatePath("/admin/plans");
  revalidatePath("/pro");
}

export async function deletePlanAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const id = String(formData.get("planId"));
  const plan = await db.plan.findUnique({ where: { id } });
  // protect the core plans that the app keys off
  if (!plan || ["FREE", "PRO_MONTHLY"].includes(plan.key)) return;
  await db.plan.delete({ where: { id } });
  await audit(staff.id, "DELETE_PLAN", plan.name);
  revalidatePath("/admin/plans");
  revalidatePath("/pro");
}

// ── Point packages ──
export async function savePointPackageAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const id = String(formData.get("packageId") || "");
  const points = Number(formData.get("points"));
  const bonus = Number(formData.get("bonus")) || 0;
  const price = Number(formData.get("price"));
  if (!Number.isInteger(points) || points < 1 || !Number.isInteger(price) || price < 0) return;
  if (id) {
    await db.pointPackage.update({
      where: { id },
      data: { points, bonus, price, isActive: formData.get("isActive") != null },
    });
  } else {
    const count = await db.pointPackage.count();
    await db.pointPackage.create({ data: { points, bonus, price, sortOrder: count } });
  }
  await audit(staff.id, id ? "UPDATE_POINT_PKG" : "CREATE_POINT_PKG", `${points}pts / ${price}ر.س`);
  revalidatePath("/admin/points");
  revalidatePath("/dashboard/wallet");
}

export async function deletePointPackageAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const id = String(formData.get("packageId"));
  await db.pointPackage.delete({ where: { id } }).catch(() => null);
  await audit(staff.id, "DELETE_POINT_PKG", id);
  revalidatePath("/admin/points");
  revalidatePath("/dashboard/wallet");
}

// ── Staff management (ADMIN only) ──
export async function createStaffAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const { hashSync } = await import("bcryptjs");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "SUPPORT");
  if (name.length < 2 || !email.includes("@") || password.length < 8) return;
  if (!["ADMIN", "MODERATOR", "SUPPORT", "ACCOUNTANT"].includes(role)) return;
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) {
    // promote an existing account instead of failing silently
    if (exists.role === "USER") {
      await db.user.update({ where: { id: exists.id }, data: { role } });
      await audit(staff.id, "PROMOTE_STAFF", `${exists.name} → ${role}`);
    }
  } else {
    await db.user.create({
      data: {
        name,
        email,
        city: "الرياض",
        passwordHash: hashSync(password, 12),
        role,
        credibility: 100,
        avatarColor: "#404040",
      },
    });
    await audit(staff.id, "CREATE_STAFF", `${name} (${email}) — ${role}`);
  }
  revalidatePath("/admin/staff");
}

export async function updateStaffRoleAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const userId = String(formData.get("userId"));
  const role = String(formData.get("role"));
  if (!["ADMIN", "MODERATOR", "SUPPORT", "ACCOUNTANT"].includes(role)) return;
  if (userId === staff.id) return; // can't change your own role
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return;
  await db.user.update({ where: { id: userId }, data: { role } });
  await audit(staff.id, "UPDATE_STAFF_ROLE", `${target.name} → ${role}`);
  revalidatePath("/admin/staff");
}

export async function removeStaffAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const userId = String(formData.get("userId"));
  if (userId === staff.id) return; // can't remove yourself
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.role === "USER") return;
  await db.user.update({ where: { id: userId }, data: { role: "USER" } });
  await audit(staff.id, "REMOVE_STAFF", `${target.name} (${target.email})`);
  revalidatePath("/admin/staff");
}

// ── Global settings ──
export async function saveSettingsAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const perDay = Number(formData.get("CAMPAIGN_POINTS_PER_DAY"));
  const featureCost = Number(formData.get("FEATURE_POINT_COST"));
  const dayOptions = String(formData.get("CAMPAIGN_DAY_OPTIONS") ?? "");
  if (Number.isInteger(perDay) && perDay >= 0) {
    await setSetting("CAMPAIGN_POINTS_PER_DAY", String(perDay));
  }
  if (Number.isInteger(featureCost) && featureCost >= 0) {
    await setSetting("FEATURE_POINT_COST", String(featureCost));
  }
  // sanitize the campaign day list: positive integers, deduped, sorted
  const days = [
    ...new Set(
      dayOptions
        .split(/[,\s،]+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 365)
    ),
  ].sort((a, b) => a - b);
  if (days.length > 0) {
    await setSetting("CAMPAIGN_DAY_OPTIONS", days.join(","));
  }
  await audit(
    staff.id,
    "UPDATE_SETTINGS",
    `perDay=${perDay} feature=${featureCost} days=${days.join(",")}`
  );
  revalidatePath("/admin/points");
}

/** Footer social links (Instagram / Facebook / Snapchat) — empty disables the link. */
export async function saveSocialLinksAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const keys = ["SOCIAL_INSTAGRAM", "SOCIAL_FACEBOOK", "SOCIAL_SNAPCHAT"] as const;
  for (const key of keys) {
    const raw = String(formData.get(key) ?? "").trim();
    // only real https links are stored — anything else clears the link
    const url = /^https:\/\/.+\..+/.test(raw) ? raw : "";
    await setSetting(key, url);
  }
  await audit(staff.id, "UPDATE_SOCIAL_LINKS", "footer social links updated");
  revalidatePath("/admin/banners");
  revalidatePath("/");
}

/** «تواصل معنا» page contact details (email / phone / whatsapp / hours). */
export async function saveContactInfoAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const fields: [key: string, maxLen: number][] = [
    ["CONTACT_EMAIL", 120],
    ["CONTACT_PHONE", 30],
    ["CONTACT_WHATSAPP", 30],
    ["CONTACT_HOURS", 120],
  ];
  for (const [key, maxLen] of fields) {
    const value = String(formData.get(key) ?? "").trim().slice(0, maxLen);
    await setSetting(key, value);
  }
  await audit(staff.id, "UPDATE_CONTACT_INFO", "contact page details updated");
  revalidatePath("/admin/banners");
  revalidatePath("/contact");
}

/**
 * Free-tier launch promo: while enabled, every new signup gets PRO for
 * FREE_TIER_DAYS days (expiry handled by cron / dashboard visits).
 * Toggling it off never revokes already-granted memberships.
 */
export async function saveFreeTierAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const enabled = formData.get("enabled") === "on";
  const daysRaw = parseInt(String(formData.get("days") ?? ""), 10);
  const days = Number.isInteger(daysRaw) ? Math.min(365, Math.max(1, daysRaw)) : 30;
  await setSetting("FREE_TIER_ENABLED", enabled ? "1" : "0");
  await setSetting("FREE_TIER_DAYS", String(days));
  await audit(
    staff.id,
    "UPDATE_FREE_TIER",
    enabled ? `enabled — ${days} days of PRO per signup` : "disabled"
  );
  revalidatePath("/admin/plans");
  revalidatePath("/register");
  revalidatePath("/pro");
}

/**
 * Referral program settings: on/off switch + the commission percentage the
 * referrer earns on every points purchase made by users they invited.
 */
export async function saveReferralSettingsAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const enabled = formData.get("enabled") === "on";
  const percentRaw = parseInt(String(formData.get("percent") ?? ""), 10);
  const percent = Number.isInteger(percentRaw) ? Math.min(100, Math.max(0, percentRaw)) : 10;
  await setSetting("REFERRAL_ENABLED", enabled ? "1" : "0");
  await setSetting("REFERRAL_PERCENT", String(percent));
  await audit(
    staff.id,
    "UPDATE_REFERRAL",
    enabled ? `enabled — ${percent}% commission per top-up` : "disabled"
  );
  revalidatePath("/admin/promos");
  revalidatePath("/dashboard/referrals");
}

// ── Promo codes ──
export async function createPromoCodeAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const { normalizePromoCode } = await import("@/lib/promo");
  const code = normalizePromoCode(String(formData.get("code") ?? ""));
  const percent = parseInt(String(formData.get("percent") ?? ""), 10);
  const maxUses = parseInt(String(formData.get("maxUses") ?? "0"), 10) || 0;
  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();
  if (!/^[A-Z0-9-]{3,30}$/.test(code)) return;
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) return;
  const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
  if (expiresAt && isNaN(expiresAt.getTime())) return;
  await db.promoCode.upsert({
    where: { code },
    create: {
      code,
      percent,
      maxUses: Math.max(0, maxUses),
      oncePerUser: formData.get("oncePerUser") != null,
      expiresAt,
    },
    update: {}, // existing code: no silent overwrite — delete it first
  });
  await audit(staff.id, "CREATE_PROMO", `${code} — ${percent}% (max ${maxUses || "∞"})`);
  revalidatePath("/admin/promos");
}

export async function togglePromoCodeAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const id = String(formData.get("promoId"));
  const promo = await db.promoCode.findUnique({ where: { id } });
  if (!promo) return;
  await db.promoCode.update({ where: { id }, data: { isActive: !promo.isActive } });
  await audit(staff.id, "TOGGLE_PROMO", `${promo.code} → ${promo.isActive ? "معطل" : "نشط"}`);
  revalidatePath("/admin/promos");
}

export async function deletePromoCodeAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const id = String(formData.get("promoId"));
  const promo = await db.promoCode.delete({ where: { id } }).catch(() => null);
  if (promo) await audit(staff.id, "DELETE_PROMO", promo.code);
  revalidatePath("/admin/promos");
}

export async function addBannedWordAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const { normalizeArabic } = await import("@/lib/arabic");
  const word = normalizeArabic(String(formData.get("word") || ""));
  if (word.length < 2) return;
  await db.bannedWord.upsert({
    where: { word },
    create: { word },
    update: {},
  });
  await audit(staff.id, "ADD_BANNED_WORD", word);
  revalidatePath("/admin/moderation");
}

export async function deleteBannedWordAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const id = String(formData.get("wordId"));
  const word = await db.bannedWord.delete({ where: { id } }).catch(() => null);
  if (word) await audit(staff.id, "DELETE_BANNED_WORD", word.word);
  revalidatePath("/admin/moderation");
}

export async function broadcastAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const link = String(formData.get("link") || "").trim() || null;
  if (title.length < 3 || body.length < 5) return;
  const users = await db.user.findMany({
    where: { isBanned: false },
    select: { id: true },
  });
  await db.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: "SYSTEM",
      title,
      body,
      link,
    })),
  });
  const { sendPushMany } = await import("@/lib/push");
  await sendPushMany(users.map((u) => u.id), { title, body, link: link ?? undefined });
  await audit(staff.id, "BROADCAST", `${title} → ${users.length} مستخدم`);
  revalidatePath("/admin/moderation");
}
