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
  type ListingGoal,
} from "@/lib/category-fields";
import { CITIES } from "@/lib/constants";
import { findBannedWord } from "@/lib/moderation";
import { generateListingRef } from "@/lib/ref";
import { alertSavedSearches } from "@/lib/saved-search";

import { saveImages, MAX_FILE } from "@/lib/uploads";
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

const base = z.object({
  type: z.enum(["STANDARD", "AUCTION"]),
  goal: z.enum(["SELL", "AUCTION", "ANNOUNCE"]).default("SELL"),
  categoryId: z.string().min(1),
  title: z.string().min(4).max(100),
  description: z.string().min(20).max(5000),
  // optional: categories like real estate & jobs have no condition field at
  // all — requiring it here used to reject them with a phantom-field error
  condition: z.enum(["NEW", "LIKE_NEW", "USED"]).optional(),
  city: z.enum(CITIES),
  neighborhood: z.string().max(60).optional(),
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
  if (issue.code === "too_small") {
    return `يجب أن يكون ${issue.minimum} أحرف على الأقل — كتبت ${len}`;
  }
  if (issue.code === "too_big") {
    return `الحد الأقصى ${issue.maximum} حرف — كتبت ${len}`;
  }
  return "اختر قيمة صالحة";
}

export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "listing-create", 10, 10 * 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "سجّل دخولك أولاً" }, { status: 401 });
  }

  const fd = await req.formData().catch(() => null);
  if (!fd) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
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
    return NextResponse.json({ error: summary, fields }, { status: 400 });
  }
  const data = parsed.data;

  const category = await db.category.findUnique({
    where: { id: data.categoryId },
    include: { parent: true },
  });
  if (!category) {
    return NextResponse.json({ error: "فئة غير موجودة" }, { status: 400 });
  }
  const mainSlug = category.parent?.slug ?? category.slug;
  const cfg = configForMain(mainSlug);
  const goal = data.goal as ListingGoal;

  // goal ↔ category sanity: a job can't be sold or auctioned, a service
  // can't take bids — the form filters these, this guards direct requests
  if (!goalAllowsCategory(goal, mainSlug)) {
    return NextResponse.json(
      { error: "هذه الفئة غير متاحة لهذا الهدف — غيّر الهدف أو اختر فئة أخرى", fields: { categoryId: "غير متاحة لهذا الهدف" } },
      { status: 400 }
    );
  }
  if ((goal === "AUCTION") !== (data.type === "AUCTION")) {
    return NextResponse.json({ error: "نوع الإعلان لا يطابق الهدف" }, { status: 400 });
  }

  // collect category-specific attributes (attr_<key>) and validate required —
  // every missing required field is reported so its box lights up red
  const attributes: Record<string, string> = {};
  const attrErrors: Record<string, string> = {};
  for (const f of cfg.fields) {
    const val = String(fd.get(`attr_${f.key}`) ?? "").trim();
    if (val) attributes[f.key] = val;
    else if (f.required) attrErrors[`attr_${f.key}`] = `حقل "${f.label}" مطلوب`;
  }
  if (Object.keys(attrErrors).length > 0) {
    return NextResponse.json(
      { error: Object.values(attrErrors).join(" · "), fields: attrErrors },
      { status: 400 }
    );
  }
  const attrText = Object.values(attributes).join(" ");

  // banned content check (admin-managed word list)
  const banned = await findBannedWord(`${data.title} ${data.description}`);
  if (banned) {
    return NextResponse.json(
      { error: "الإعلان يحتوي محتوى مخالفاً لسياسات المنصة والأنظمة المحلية" },
      { status: 422 }
    );
  }

  // account limits (from admin-editable plans)
  const limits = await getPlanLimits(user.isPro);
  const activeCount = await db.listing.count({
    where: { sellerId: user.id, status: "ACTIVE", type: data.type },
  });
  if (data.type === "STANDARD" && activeCount >= limits.maxListings) {
    return NextResponse.json(
      { error: `الحد الأقصى ${limits.maxListings} إعلانات نشطة — رقِّ حسابك إلى برو` },
      { status: 403 }
    );
  }
  if (data.type === "AUCTION" && activeCount >= limits.maxAuctions) {
    return NextResponse.json(
      { error: `الحد الأقصى ${limits.maxAuctions} مزادات نشطة` },
      { status: 403 }
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

    if (!Number.isInteger(startPrice) || startPrice < 1) {
      return NextResponse.json({ error: "سعر البداية غير صالح" }, { status: 400 });
    }
    if (!Number.isInteger(minIncrement) || minIncrement < 1) {
      return NextResponse.json({ error: "حد الزيادة غير صالح" }, { status: 400 });
    }
    if (![24, 72, 120, 168].includes(durationHours)) {
      return NextResponse.json({ error: "مدة المزاد غير صالحة" }, { status: 400 });
    }
    if (buyNowPrice != null && (!Number.isInteger(buyNowPrice) || buyNowPrice <= startPrice)) {
      return NextResponse.json(
        { error: "سعر الشراء الفوري يجب أن يكون أعلى من سعر البداية" },
        { status: 400 }
      );
    }
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
      if (!Number.isInteger(price) || price < 1) {
        return NextResponse.json(
          { error: "السعر غير صالح", fields: { price: "أدخل رقماً صحيحاً أكبر من صفر" } },
          { status: 400 }
        );
      }
    }
  }

  // image uploads
  const files = fd.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > 10) {
    return NextResponse.json({ error: "الحد الأقصى 10 صور" }, { status: 400 });
  }
  const urls: string[] = [];
  if (files.length > 0) {
    for (const file of files) {
      if (file.size > MAX_FILE) {
        return NextResponse.json(
          { error: "حجم الصورة يتجاوز 5 ميجابايت — جرّب صورة أصغر" },
          { status: 400 }
        );
      }
    }
    const saved = await saveImages(files);
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error }, { status: 400 });
    }
    urls.push(...saved.urls);
  } else {
    urls.push(`/images/ph/${FALLBACK[category.icon] ?? "chair1"}.svg`);
  }

  const showPhone = fd.get("showPhone") != null && !!user.phone;
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

  const ref = await generateListingRef();
  const listing = await db.listing.create({
    data: {
      ref,
      type: data.type,
      title: data.title,
      description: data.description,
      price,
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
  });

  let auctionId: string | undefined;
  if (auctionInput) {
    const auction = await db.auction.create({
      data: {
        listingId: listing.id,
        startPrice: auctionInput.startPrice,
        minIncrement: auctionInput.minIncrement,
        buyNowPrice: auctionInput.buyNowPrice,
        terms: auctionInput.terms,
        endsAt: new Date(Date.now() + auctionInput.durationHours * 3_600_000),
      },
    });
    auctionId = auction.id;
  }

  // saved-search + follower alerts (best-effort, never blocks publishing)
  await alertSavedSearches(listing.id);

  return NextResponse.json({ ok: true, id: listing.id, auctionId });
}
