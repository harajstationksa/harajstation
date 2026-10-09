import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPlanLimits } from "@/lib/limits";
import { buildSearchText } from "@/lib/arabic";
import {
  configForMain,
  goalAllowsCategory,
  goalRequiresPrice,
  GOAL_TYPE,
  NOT_AUCTION,
  type ListingGoal,
} from "@/lib/category-fields";
import { findBannedWord } from "@/lib/moderation";
import {
  REVIEW_RULES,
  addReviewReason,
  classifyListing,
  isLikelyDuplicate,
  type ReviewResult,
} from "@/lib/smart-review";
import { generateListingRef } from "@/lib/ref";
import { lockPublishingQuota, hasListingCapacity } from "@/lib/listing-policy";
import { validAmount, readAttributes, listingFieldsSchema } from "@/lib/listing-validation";

import { saveImages, deleteImages, MAX_FILE } from "@/lib/uploads";
import { rateLimitGuard } from "@/lib/rate-limit";

// category icon → fallback placeholder image
const FALLBACK: Record<string, string> = {
  car: "car2",
  building: "apt1",
  smartphone: "phone1",
  sofa: "sofa1",
  shirt: "bag1",
  paw: "cat1",
  dumbbell: "dumbbell1",
  wrench: "tools1",
  factory: "tools1",
  briefcase: "book1",
  package: "chair1",
};

const base = listingFieldsSchema.extend({
  type: z.enum(["STANDARD", "AUCTION", "ANNOUNCE"]),
  goal: z.enum(["SELL", "AUCTION", "ANNOUNCE"]).default("SELL"),
  categoryId: z.string().min(1),
  // optional: categories like real estate & jobs have no condition field at
  // all — requiring it here used to reject them with a phantom-field error
});

// Arabic field labels + human validation messages so a rejected submit tells
// the user exactly WHICH field failed and WHY (not a generic error)
const FIELD_LABEL: Record<string, string> = {
  type: "نوع الإعلان",
  categoryId: "الفئة",
  title: "العنوان",
  description: "الوصف",
  condition: "الحالة",
  city: "المدينة",
  neighborhood: "الحي",
};

function describeIssue(issue: z.ZodIssue, value: unknown): string {
  const len = typeof value === "string" ? value.length : 0;

  // An untouched field is the common case, and "must be at least 1 characters —
  // you wrote 0" is a strange thing to say to someone who simply hasn't filled
  // it in yet.
  const empty = value == null || (typeof value === "string" && value.trim() === "");
  if (empty) return "لم تملأ هذا الحقل";

  if (issue.code === "too_small") {
    return `يجب أن يكون ${issue.minimum} أحرف على الأقل — كتبت ${len}`;
  }
  if (issue.code === "too_big") {
    return `الحد الأقصى ${issue.maximum} حرف — كتبت ${len}`;
  }
  return "اختر قيمة صالحة";
}

export async function POST(req: Request) {
  // A flood guard, not a publishing quota. It has to be generous: filling this
  // form wrong is normal — a missing field, a bad price, try again — and a limit
  // that counts rejected attempts locks an honest seller out of a form they are
  // still learning. The real anti-spam cap is on listings actually created (see
  // below), which is what a spammer is after and what costs us anything.
  const limited = await rateLimitGuard(req, "listing-attempt", 40, 10 * 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: apiMessage(req, "سجّل دخولك أولاً") }, { status: 401 });
  }

  const fd = await req.formData().catch(() => null);
  if (!fd) {
    // The body didn't parse: almost always a truncated or interrupted upload,
    // not something the seller typed wrong. Say what they can actually do about
    // it, and log the size for us — never the reason, which means nothing to
    // them and describes our internals.
    console.warn(
      `listing upload: unreadable body (content-length: ${req.headers.get("content-length") ?? "?"})`,
    );
    return NextResponse.json(
      {
        error: apiMessage(
          req,
          "لم تصلنا الصور كاملة — قد يكون الاتصال انقطع أثناء الرفع. جرّب صوراً أقل أو أعد المحاولة.",
        ),
      },
      { status: 400 },
    );
  }

  const raw = {
    type: fd.get("type"),
    goal: fd.get("goal") || (fd.get("type") === "AUCTION" ? "AUCTION" : "SELL"),
    categoryId: fd.get("categoryId"),
    title: fd.get("title"),
    description: fd.get("description"),
    condition: fd.get("condition") || undefined,
    city: fd.get("city"),
    neighborhood: fd.get("neighborhood") || undefined,
  };
  const parsed = base.safeParse(raw);
  if (!parsed.success) {
    // per-field Arabic messages: "الوصف: يجب أن يكون 20 أحرف على الأقل — كتبت 12"
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (!fields[key]) {
        fields[key] = describeIssue(issue, raw[key as keyof typeof raw]);
      }
    }
    const summary = Object.entries(fields)
      .map(([k, msg]) => `${FIELD_LABEL[k] ?? k}: ${msg}`)
      .join(" · ");
    return NextResponse.json({ error: apiMessage(req, summary), fields }, { status: 400 });
  }
  const data = parsed.data;

  const category = await db.category.findUnique({
    where: { id: data.categoryId },
    include: { parent: true },
  });
  if (!category) {
    return NextResponse.json({ error: apiMessage(req, "فئة غير موجودة") }, { status: 400 });
  }
  const mainSlug = category.parent?.slug ?? category.slug;
  const cfg = configForMain(mainSlug);
  const goal = data.goal as ListingGoal;

  // goal ↔ category sanity: a job can't be sold or auctioned, a service
  // can't take bids — the form filters these, this guards direct requests
  if (!goalAllowsCategory(goal, mainSlug)) {
    return NextResponse.json(
      {
        error: apiMessage(req, "هذه الفئة غير متاحة لهذا الهدف — غيّر الهدف أو اختر فئة أخرى"),
        fields: { categoryId: "غير متاحة لهذا الهدف" },
      },
      { status: 400 },
    );
  }
  if (GOAL_TYPE[goal] !== data.type) {
    return NextResponse.json(
      { error: apiMessage(req, "نوع الإعلان لا يطابق الهدف") },
      { status: 400 },
    );
  }

  // collect category-specific attributes (attr_<key>) and validate required —
  // every missing required field is reported so its box lights up red
  const { attributes, errors: attrErrors } = readAttributes(fd, cfg);
  if (Object.keys(attrErrors).length > 0) {
    return NextResponse.json(
      { error: apiMessage(req, Object.values(attrErrors).join(" · ")), fields: attrErrors },
      { status: 400 },
    );
  }
  const attrText = Object.values(attributes).join(" ");

  // account limits (from admin-editable plans). Sale posts and announcements
  // share the one "listings" quota — counting them separately would hand every
  // account a second, uncapped allowance to spam announcements through.
  const isAuction = data.type === "AUCTION";
  const limits = await getPlanLimits(user.isPro);
  const activeCount = await db.listing.count({
    where: {
      sellerId: user.id,
      status: { in: ["ACTIVE", "PENDING", "AWAITING_INFO"] },
      type: isAuction ? "AUCTION" : NOT_AUCTION,
    },
  });
  if (!isAuction && activeCount >= limits.maxListings) {
    return NextResponse.json(
      {
        error: apiMessage(
          req,
          `الحد الأقصى ${limits.maxListings} إعلانات نشطة — رقِّ حسابك إلى برو`,
        ),
      },
      { status: 403 },
    );
  }
  if (isAuction && activeCount >= limits.maxAuctions) {
    return NextResponse.json(
      { error: apiMessage(req, `الحد الأقصى ${limits.maxAuctions} مزادات نشطة`) },
      { status: 403 },
    );
  }

  // auction fields
  let auctionInput: {
    startPrice: number;
    minIncrement: number;
    buyNowPrice: number | null;
    durationHours: number;
    terms: string | null;
  } | null = null;
  let price: number | null = null;

  if (data.type === "AUCTION") {
    const startPrice = Number(fd.get("startPrice"));
    const minIncrement = Number(fd.get("minIncrement"));
    const durationHours = Number(fd.get("durationHours"));
    const buyNowRaw = String(fd.get("buyNowPrice") ?? "").trim();
    const buyNowPrice = buyNowRaw ? Number(buyNowRaw) : null;

    if (!validAmount(startPrice)) {
      return NextResponse.json({ error: apiMessage(req, "سعر البداية غير صالح") }, { status: 400 });
    }
    if (!validAmount(minIncrement)) {
      return NextResponse.json({ error: apiMessage(req, "حد الزيادة غير صالح") }, { status: 400 });
    }
    if (![24, 72, 120, 168].includes(durationHours)) {
      return NextResponse.json({ error: apiMessage(req, "مدة المزاد غير صالحة") }, { status: 400 });
    }
    if (buyNowPrice != null && (!validAmount(buyNowPrice) || buyNowPrice <= startPrice)) {
      return NextResponse.json(
        { error: apiMessage(req, "سعر الشراء الفوري يجب أن يكون أعلى من سعر البداية") },
        { status: 400 },
      );
    }
    if (String(fd.get("terms") ?? "").length > 5000)
      return NextResponse.json(
        { error: apiMessage(req, "شروط المزاد طويلة جداً") },
        { status: 400 },
      );
    auctionInput = {
      startPrice,
      minIncrement,
      buyNowPrice,
      durationHours,
      terms: String(fd.get("terms") ?? "").trim() || null,
    };
  } else {
    const priceRaw = String(fd.get("price") ?? "").trim();
    if (!priceRaw && !goalRequiresPrice(goal)) {
      // announcements (وظيفة، خدمة...) may omit the price → "على السوم"
      price = null;
    } else {
      price = Number(priceRaw);
      if (!validAmount(price)) {
        return NextResponse.json(
          {
            error: apiMessage(req, "السعر غير صالح"),
            fields: { price: "أدخل رقماً صحيحاً أكبر من صفر" },
          },
          { status: 400 },
        );
      }
    }
  }

  let review: ReviewResult;
  try {
    review = classifyListing({
      title: data.title,
      description: data.description,
      categorySlug: category.slug,
      parentSlug: category.parent?.slug,
      categoryName: category.nameAr,
      attributes,
    });
    const banned = await findBannedWord(`${data.title} ${data.description} ${attrText}`);
    if (banned)
      review = addReviewReason(review, "PROHIBITED", "BANNED_WORD", "قائمة محظورات الإدارة");
    if (REVIEW_RULES.duplicate) {
      const recent = await db.listing.findMany({
        where: {
          sellerId: user.id,
          status: { in: ["ACTIVE", "PENDING", "AWAITING_INFO"] },
          createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
        },
        select: { title: true, description: true, categoryId: true, price: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      });
      if (
        isLikelyDuplicate(
          { title: data.title, description: data.description, categoryId: category.id, price },
          recent,
        )
      )
        review = addReviewReason(review, "SENSITIVE", "DUPLICATE", "إعلان مماثل من البائع");
    }
  } catch {
    review = { level: "SENSITIVE", reasons: ["ANALYSIS_FAILED"], signals: [] };
  }
  const pendingReview = review.level !== "NORMAL";

  // Everything checks out, so this request is about to become a real listing —
  // charge it against the publishing cap now, before we spend time storing
  // images. Keyed by account, because that is the thing a spammer has to burn.

  // image uploads
  const files = fd.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > 10) {
    return NextResponse.json({ error: apiMessage(req, "الحد الأقصى 10 صور") }, { status: 400 });
  }
  const urls: string[] = [];
  if (files.length > 0) {
    for (const file of files) {
      if (file.size > MAX_FILE) {
        return NextResponse.json(
          { error: apiMessage(req, "حجم الصورة يتجاوز 5 ميجابايت — جرّب صورة أصغر") },
          { status: 400 },
        );
      }
    }
    const saved = await saveImages(files, "listings");
    if (!saved.ok) {
      return NextResponse.json({ error: apiMessage(req, saved.error) }, { status: 400 });
    }
    urls.push(...saved.urls);
  } else {
    urls.push(`/images/ph/${FALLBACK[category.icon] ?? "chair1"}.svg`);
  }

  const showPhone = fd.get("showPhone") != null && !!user.phone && user.phoneVerified;
  const deliveryRaw = String(fd.get("deliveryMethod") ?? "PICKUP");
  const deliveryMethod =
    cfg.showDelivery && ["PICKUP", "SHIPPING", "DELIVERY"].includes(deliveryRaw)
      ? deliveryRaw
      : "PICKUP";

  // store assignment — must belong to the seller
  let storeId: string | null = null;
  const storeRaw = String(fd.get("storeId") ?? "").trim();
  if (storeRaw) {
    const store = await db.store.findUnique({ where: { id: storeRaw } });
    if (store && store.userId === user.id) storeId = store.id;
  }

  try {
    const listing = await db.$transaction(async (tx) => {
      await lockPublishingQuota(tx, user.id);
      if (
        (await tx.listing.count({
          where: { sellerId: user.id, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
        })) >= 10
      )
        throw new Error("PUBLISH_RATE_LIMIT");
      if (!(await hasListingCapacity(tx, user.id, user.isPro, isAuction)))
        throw new Error("LISTING_QUOTA");
      const created = await tx.listing.create({
        data: {
          ...(auctionInput
            ? {
                auction: {
                  create: {
                    startPrice: auctionInput.startPrice,
                    minIncrement: auctionInput.minIncrement,
                    buyNowPrice: auctionInput.buyNowPrice,
                    terms: auctionInput.terms,
                    endsAt: new Date(Date.now() + auctionInput.durationHours * 3600000),
                    status: pendingReview ? "PENDING" : "LIVE",
                  },
                },
              }
            : {}),
          ref: await generateListingRef(tx),
          type: data.type,
          title: data.title,
          description: data.description,
          price,
          status: pendingReview ? "PENDING" : "ACTIVE",
          riskLevel: review.level,
          riskReasons: JSON.stringify(review.reasons),
          riskSignals: JSON.stringify(review.signals),
          // categories without a condition field (عقارات، وظائف، خدمات) default it
          condition: cfg.showCondition ? (data.condition ?? "USED") : "USED",
          city: data.city,
          neighborhood: data.neighborhood ?? null,
          images: JSON.stringify(urls),
          sellerId: user.id,
          categoryId: category.id,
          storeId,
          phone: showPhone ? user.phone : null,
          whatsapp: showPhone ? user.phone : null,
          showPhone,
          deliveryMethod,
          attributes: JSON.stringify(attributes),
          searchText: buildSearchText(data.title, data.description, data.city, attrText),
        },
        include: { auction: { select: { id: true } } },
      });

      if (!pendingReview)
        await tx.backgroundJob.create({
          data: {
            kind: "LISTING_ALERT",
            dedupKey: `listing:${created.id}`,
            payload: JSON.stringify({ listingId: created.id }),
          },
        });
      return created;
    });
    return NextResponse.json({
      ok: true,
      id: listing.id,
      auctionId: listing.auction?.id,
      pendingReview,
    });
  } catch (error) {
    await deleteImages(urls);
    if (error instanceof Error && error.message === "PUBLISH_RATE_LIMIT")
      return NextResponse.json(
        { error: apiMessage(req, "نشرت إعلانات كثيرة خلال وقت قصير — انتظر قليلاً") },
        { status: 429 },
      );
    if (error instanceof Error && error.message === "LISTING_QUOTA")
      return NextResponse.json(
        { error: apiMessage(req, "وصلت الحد الأقصى للإعلانات النشطة") },
        { status: 403 },
      );
    console.error("listing creation failed", {
      code: (error as { code?: string }).code ?? "CREATE_FAILED",
    });
    return NextResponse.json(
      { error: apiMessage(req, "تعذر حفظ الإعلان، حاول مجدداً") },
      { status: 500 },
    );
  }
}
