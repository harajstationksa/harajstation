"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { applyCredibility, resolveDispute } from "@/lib/credibility";
import { adjustPoints } from "@/lib/points";
import { getSetting, setSetting } from "@/lib/settings";

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
  const mobileImageUrl = String(formData.get("mobileImageUrl") || "").trim() || null;
  const linkUrl = String(formData.get("linkUrl") || "").trim() || null;
  const embedHtml = String(formData.get("embedHtml") || "").trim() || null;
  const position = String(formData.get("position") || "HOME_TOP");
  if (!title || (!imageUrl && !embedHtml)) return;
  await db.banner.create({
    data: { title, imageUrl, mobileImageUrl, linkUrl, embedHtml, position },
  });
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

/**
 * Grant / extend / revoke a PRO membership for one user.
 * mode: "days" (adds `days` starting from the later of now / current expiry),
 * "permanent" (no expiry), or "revoke".
 */
export async function grantProAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN"]);
  const userId = String(formData.get("userId"));
  const mode = String(formData.get("mode"));
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const { notify } = await import("@/lib/notify");

  if (mode === "revoke") {
    if (!user.isPro) return;
    await db.user.update({
      where: { id: userId },
      data: { isPro: false, proUntil: null },
    });
    await audit(staff.id, "REVOKE_PRO", `${user.name} (${user.email})`);
    await notify(
      userId,
      "SYSTEM",
      "انتهى اشتراكك في برو",
      "تم إيقاف عضوية PRO على حسابك — يمكنك الاشتراك مجدداً في أي وقت.",
      "/pro"
    );
    revalidatePath("/admin/users");
    return;
  }

  if (mode === "permanent") {
    await db.user.update({
      where: { id: userId },
      data: { isPro: true, proUntil: null },
    });
    await audit(staff.id, "GRANT_PRO", `${user.name} — دائم`);
    await notify(
      userId,
      "SYSTEM",
      "تمت ترقيتك إلى برو 🎉",
      "حصلت على عضوية PRO دائمة — استمتع بحدود أعلى للإعلانات والمزادات والمتاجر.",
      "/pro"
    );
    revalidatePath("/admin/users");
    return;
  }

  const days = parseInt(String(formData.get("days") ?? ""), 10);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return;
  // extending an active timed membership stacks on top of its current expiry;
  // a permanent membership stays permanent (nothing to extend)
  if (user.isPro && user.proUntil === null) return;
  const base =
    user.isPro && user.proUntil && user.proUntil > new Date()
      ? user.proUntil
      : new Date();
  const proUntil = new Date(base.getTime() + days * 86_400_000);
  await db.user.update({
    where: { id: userId },
    data: { isPro: true, proUntil },
  });
  await audit(staff.id, "GRANT_PRO", `${user.name} — ${days} يوم (حتى ${proUntil.toISOString().slice(0, 10)})`);
  await notify(
    userId,
    "SYSTEM",
    "تمت ترقيتك إلى برو 🎉",
    `حصلت على عضوية PRO لمدة ${days} يوم — استمتع بحدود أعلى للإعلانات والمزادات والمتاجر.`,
    "/pro"
  );
  revalidatePath("/admin/users");
}

/** Send a private notification (in-app + push) to a single user. */
export async function notifyUserAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN", "MODERATOR", "SUPPORT"]);
  const userId = String(formData.get("userId"));
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const link = String(formData.get("link") || "").trim() || undefined;
  if (title.length < 3 || title.length > 100) return;
  if (body.length < 5 || body.length > 500) return;
  if (link && !/^(\/|https:\/\/)/.test(link)) return;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const { notify } = await import("@/lib/notify");
  await notify(userId, "ADMIN", title, body, link);
  await audit(staff.id, "NOTIFY_USER", `${user.name}: ${title}`);
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
  const { randomBytes } = await import("node:crypto");
  const { sendEmail } = await import("@/lib/email");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "SUPPORT");
  if (name.length < 2 || !email.includes("@")) return;
  if (!["ADMIN", "MODERATOR", "SUPPORT", "ACCOUNTANT"].includes(role)) return;

  const portalUrl = process.env.ADMIN_HOST
    ? `https://${process.env.ADMIN_HOST}`
    : "/admin-login";

  const exists = await db.user.findUnique({ where: { email } });
  if (exists) {
    // promote an existing account instead of failing silently
    if (exists.role === "USER") {
      await db.user.update({ where: { id: exists.id }, data: { role } });
      await audit(staff.id, "PROMOTE_STAFF", `${exists.name} → ${role}`);
    }
  } else {
    // no password is ever chosen by the admin on someone's behalf: the account
    // starts passwordless (unguessable random hash), the invitee signs in with
    // an email code and sets their own password from inside the portal
    await db.user.create({
      data: {
        name,
        email,
        city: "الرياض",
        passwordHash: hashSync(randomBytes(32).toString("hex"), 12),
        passwordEnabled: false,
        emailVerifiedAt: new Date(),
        role,
        credibility: 100,
        avatarColor: "#404040",
      },
    });
    await audit(staff.id, "CREATE_STAFF", `${name} (${email}) — ${role}`);
    await sendEmail({
      to: email,
      subject: "انضممت لفريق عمل حراج ستيشن",
      html:
        `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8">` +
        `<h2>أهلاً ${name} 👋</h2>` +
        `<p>تمت إضافتك لفريق عمل حراج ستيشن.</p>` +
        `<p>ادخل على بوابة الإدارة بهذا البريد وسيصلك رمز دخول لمرة واحدة — ` +
        `ولا تحتاج كلمة مرور، وتقدر تفعّل واحدة من إعدادات حسابك بعد الدخول:</p>` +
        `<p><a href="${portalUrl}">${portalUrl}</a></p>` +
        `</div>`,
    });
  }
  revalidatePath("/admin/staff");
}

// ── My account (any staff member, self-service) ──

export async function updateMyAccountAction(formData: FormData) {
  const me = await requireStaff(["ADMIN", "MODERATOR", "SUPPORT", "ACCOUNTANT"]);
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (name.length < 2 || !email.includes("@")) return;
  const taken = await db.user.findFirst({
    where: { email, id: { not: me.id } },
    select: { id: true },
  });
  if (taken) return;
  await db.user.update({ where: { id: me.id }, data: { name, email } });
  await audit(me.id, "UPDATE_MY_ACCOUNT", `${name} (${email})`);
  revalidatePath("/admin/account");
}

export async function setMyPasswordAction(formData: FormData) {
  const me = await requireStaff(["ADMIN", "MODERATOR", "SUPPORT", "ACCOUNTANT"]);
  const { hashSync } = await import("bcryptjs");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password.length < 10 || password !== confirm) return;
  await db.user.update({
    where: { id: me.id },
    data: { passwordHash: hashSync(password, 12), passwordEnabled: true },
  });
  await audit(me.id, "SET_MY_PASSWORD", "password enabled");
  revalidatePath("/admin/account");
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
  const bumpCost = Number(formData.get("BUMP_POINT_COST"));
  if (Number.isInteger(bumpCost) && bumpCost >= 0) {
    await setSetting("BUMP_POINT_COST", String(bumpCost));
  }
  const bumpFreeHours = Number(formData.get("BUMP_FREE_HOURS"));
  if (Number.isInteger(bumpFreeHours) && bumpFreeHours >= 1 && bumpFreeHours <= 720) {
    await setSetting("BUMP_FREE_HOURS", String(bumpFreeHours));
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

/** Show/hide the homepage stats strip (active ads / live auctions / trusted users). */
export async function toggleHomeStatsAction() {
  const staff = await requireStaff(["ADMIN"]);
  const visible = (await getSetting("HOME_STATS_VISIBLE")) === "1";
  await setSetting("HOME_STATS_VISIBLE", visible ? "0" : "1");
  await audit(
    staff.id,
    "TOGGLE_HOME_STATS",
    `homepage stats strip ${visible ? "hidden" : "shown"}`
  );
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
