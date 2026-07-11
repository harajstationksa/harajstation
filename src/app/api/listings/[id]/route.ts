import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildSearchText } from "@/lib/arabic";
import { findBannedWord } from "@/lib/moderation";
import { saveImages } from "@/lib/uploads";
import { parseImages } from "@/lib/utils";
import { CITIES } from "@/lib/constants";

const schema = z.object({
  title: z.string().min(4).max(100),
  description: z.string().min(20).max(5000),
  condition: z.enum(["NEW", "LIKE_NEW", "USED"]),
  city: z.enum(CITIES),
  neighborhood: z.string().max(60).optional(),
});

/** Edit an existing listing (owner only). */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "سجّل دخولك أولاً" }, { status: 401 });
  }

  const listing = await db.listing.findUnique({
    where: { id },
    include: { auction: true },
  });
  if (!listing || listing.sellerId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (listing.status === "REMOVED") {
    return NextResponse.json({ error: "الإعلان محذوف" }, { status: 409 });
  }

  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });

  const parsed = schema.safeParse({
    title: fd.get("title"),
    description: fd.get("description"),
    condition: fd.get("condition"),
    city: fd.get("city"),
    neighborhood: fd.get("neighborhood") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "تحقق من الحقول المطلوبة" }, { status: 400 });
  }
  const data = parsed.data;

  const banned = await findBannedWord(`${data.title} ${data.description}`);
  if (banned) {
    return NextResponse.json(
      { error: "الإعلان يحتوي محتوى مخالفاً للسياسات" },
      { status: 422 }
    );
  }

  // price only for standard listings (auction price lives on the auction)
  let price = listing.price;
  if (listing.type === "STANDARD") {
    const p = Number(fd.get("price"));
    if (!Number.isInteger(p) || p < 1) {
      return NextResponse.json({ error: "السعر غير صالح" }, { status: 400 });
    }
    price = p;
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
    return NextResponse.json({ error: "الحد الأقصى 10 صور" }, { status: 400 });
  }
  const saved = await saveImages(files);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });

  let images = [...kept, ...saved.urls];
  if (images.length === 0) images = currentImages.slice(0, 1); // never leave imageless

  const showPhone = fd.get("showPhone") != null && !!user.phone;
  const deliveryRaw = String(fd.get("deliveryMethod") ?? listing.deliveryMethod);
  const deliveryMethod = ["PICKUP", "SHIPPING", "DELIVERY"].includes(deliveryRaw)
    ? deliveryRaw
    : listing.deliveryMethod;

  await db.listing.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      condition: data.condition,
      city: data.city,
      neighborhood: data.neighborhood ?? null,
      price,
      images: JSON.stringify(images),
      showPhone,
      phone: showPhone ? user.phone : null,
      whatsapp: showPhone ? user.phone : null,
      deliveryMethod,
      searchText: buildSearchText(data.title, data.description, data.city),
    },
  });

  return NextResponse.json({ ok: true, id });
}
