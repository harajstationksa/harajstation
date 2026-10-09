import { apiMessage } from "@/lib/api-messages";
import { configForMain } from "@/lib/category-fields";
import { validAmount, readAttributes, listingFieldsSchema } from "@/lib/listing-validation";
import { lockListing } from "@/lib/listing-policy";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildSearchText } from "@/lib/arabic";
import { findBannedWord } from "@/lib/moderation";
import { addReviewReason, classifyListing, type ReviewResult } from "@/lib/smart-review";
import { deleteImages, saveImages } from "@/lib/uploads";
import { parseImages } from "@/lib/utils";
import { rateLimitGuard } from "@/lib/rate-limit";

const schema = listingFieldsSchema;

/** Edit an existing listing (owner only). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitGuard(req, "listing-edit", 20, 10 * 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: apiMessage(req, "سجّل دخولك أولاً") }, { status: 401 });
  }

  const listing = await db.listing.findUnique({
    where: { id },
    include: { auction: true, category: { include: { parent: true } } },
  });
  if (!listing || listing.sellerId !== user.id) {
    return NextResponse.json({ error: apiMessage(req, "غير مصرح") }, { status: 403 });
  }
  if (!["ACTIVE", "PENDING", "AWAITING_INFO"].includes(listing.status)) {
    return NextResponse.json(
      { error: apiMessage(req, "لا يمكن تعديل إعلان منتهٍ أو محذوف") },
      { status: 409 },
    );
  }

  const fd = await req.formData().catch(() => null);
  if (!fd) {
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

  const parsed = schema.safeParse({
    title: fd.get("title"),
    description: fd.get("description"),
    condition: fd.get("condition") || undefined,
    city: fd.get("city"),
    neighborhood: fd.get("neighborhood") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: apiMessage(req, "تحقق من الحقول المطلوبة") },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const cfg = configForMain(listing.category.parent?.slug ?? listing.category.slug);
  let oldAttributes: Record<string, string> = {};
  try {
    oldAttributes = JSON.parse(listing.attributes);
  } catch {}
  const { attributes, errors } = readAttributes(fd, cfg, oldAttributes);
  if (Object.keys(errors).length)
    return NextResponse.json(
      { error: apiMessage(req, Object.values(errors).join(" · ")), fields: errors },
      { status: 400 },
    );

  let review: ReviewResult;
  try {
    review = classifyListing({
      title: data.title,
      description: data.description,
      categorySlug: listing.category.slug,
      parentSlug: listing.category.parent?.slug,
      categoryName: listing.category.nameAr,
      attributes,
    });
    if (
      await findBannedWord(
        `${data.title} ${data.description} ${Object.values(attributes).join(" ")}`,
      )
    )
      review = addReviewReason(review, "PROHIBITED", "BANNED_WORD", "قائمة محظورات الإدارة");
  } catch {
    review = { level: "SENSITIVE", reasons: ["ANALYSIS_FAILED"], signals: [] };
  }

  // price only for non-auction listings (auction price lives on the auction),
  // and an announcement may legitimately have none → "على السوم"
  let price = listing.price;
  if (listing.type !== "AUCTION") {
    const raw = String(fd.get("price") ?? "").trim();
    if (!raw && listing.type === "ANNOUNCE") {
      price = null;
    } else {
      const p = Number(raw);
      if (!validAmount(p)) {
        return NextResponse.json(
          {
            error: apiMessage(req, "السعر غير صالح"),
            fields: { price: "أدخل رقماً صحيحاً أكبر من صفر" },
          },
          { status: 400 },
        );
      }
      price = p;
    }
  }

  // images: keep a subset of existing + append newly uploaded
  const keep = (() => {
    try {
      const arr = JSON.parse(String(fd.get("keepImages") ?? "[]"));
      return Array.isArray(arr) ? (arr as string[]) : [];
    } catch {
      return [];
    }
  })();
  const currentImages = parseImages(listing.images);
  const kept = keep.filter((u) => currentImages.includes(u));

  const files = fd.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (kept.length + files.length > 10) {
    return NextResponse.json({ error: apiMessage(req, "الحد الأقصى 10 صور") }, { status: 400 });
  }
  const saved = await saveImages(files, "listings");
  if (!saved.ok) return NextResponse.json({ error: apiMessage(req, saved.error) }, { status: 400 });

  let images = [...kept, ...saved.urls];
  if (images.length === 0) images = currentImages.slice(0, 1); // never leave imageless

  const showPhone = fd.get("showPhone") != null && !!user.phone && user.phoneVerified;
  const deliveryRaw = String(fd.get("deliveryMethod") ?? listing.deliveryMethod);
  const deliveryMethod =
    cfg.showDelivery && ["PICKUP", "SHIPPING", "DELIVERY"].includes(deliveryRaw)
      ? deliveryRaw
      : "PICKUP";

  let updated: boolean;
  let pendingReview = false;
  try {
    updated = await db.$transaction(async (tx) => {
      await lockListing(tx, id);
      const current = await tx.listing.findUnique({
        where: { id },
        include: { auction: { include: { _count: { select: { bids: true } } } } },
      });
      if (
        !current ||
        !["ACTIVE", "PENDING", "AWAITING_INFO"].includes(current.status) ||
        (current.auction && current.auction._count.bids > 0)
      )
        return false;
      // Once a buyer has agreed (accepted offer or an open deal), the listing
      // is what the deal — and any dispute — refers to, so it is frozen.
      const [agreedOffer, openDeal] = await Promise.all([
        tx.offer.count({ where: { listingId: id, status: "ACCEPTED" } }),
        tx.transaction.count({
          where: { listingId: id, status: { in: ["PENDING", "CONFIRMED", "DISPUTED"] } },
        }),
      ]);
      if (agreedOffer || openDeal) return false;
      // An item already waiting for a reviewer cannot publish itself by editing.
      pendingReview =
        current.status === "PENDING" ||
        current.status === "AWAITING_INFO" ||
        (current.status === "ACTIVE" && review.level !== "NORMAL");
      if (pendingReview && current.auction?.status === "LIVE") {
        await tx.auction.update({
          where: { id: current.auction.id },
          data: {
            status: "PENDING",
            reviewRemainingMs: Math.max(3600000, current.auction.endsAt.getTime() - Date.now()),
          },
        });
      }
      if (pendingReview && current.status === "ACTIVE")
        await tx.campaign.updateMany({
          where: { listingId: id, status: "ACTIVE" },
          data: { status: "PAUSED_REVIEW", reviewPausedAt: new Date() },
        });
      await tx.listing.update({
        where: { id },
        data: {
          ...(pendingReview ? { status: "PENDING", isFeatured: false, isPromoted: false } : {}),
          riskLevel: review.level,
          riskReasons: JSON.stringify(review.reasons),
          riskSignals: JSON.stringify(review.signals),
          requestMessage: null,
          reviewedBy: null,
          reviewedAt: null,
          title: data.title,
          description: data.description,
          condition: cfg.showCondition ? (data.condition ?? listing.condition) : "USED",
          city: data.city,
          neighborhood: data.neighborhood ?? null,
          price,
          images: JSON.stringify(images),
          showPhone,
          phone: showPhone ? user.phone : null,
          whatsapp: showPhone ? user.phone : null,
          deliveryMethod,
          attributes: JSON.stringify(attributes),
          searchText: buildSearchText(
            data.title,
            data.description,
            data.city,
            Object.values(attributes).join(" "),
          ),
        },
      });

      return true;
    });
  } catch {
    await deleteImages(saved.urls);
    return NextResponse.json(
      { error: apiMessage(req, "تعذر حفظ التعديل، حاول مرة أخرى") },
      { status: 500 },
    );
  }
  if (!updated) {
    await deleteImages(saved.urls);
    return NextResponse.json(
      {
        error: apiMessage(
          req,
          "لا يمكن تعديل إعلان محذوف أو مزاد بدأت المزايدة عليه أو إعلان عليه صفقة متفق عليها",
        ),
      },
      { status: 409 },
    );
  }
  // photos the seller dropped in this edit are gone from the listing —
  // remove them from storage too (best-effort, never blocks the response)
  const dropped = currentImages.filter((u) => !images.includes(u));
  if (dropped.length > 0) deleteImages(dropped).catch(() => {});

  return NextResponse.json({ ok: true, id, pendingReview });
}
