import { queuePublicImageCleanup } from "@/lib/public-image-cleanup";
import { apiMessage } from "@/lib/api-messages";
import { lockPublishingQuota } from "@/lib/listing-policy";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPlanLimits } from "@/lib/limits";
import { findBannedWord } from "@/lib/moderation";
import { rateLimitGuard } from "@/lib/rate-limit";
import { deletePrivateImage, deleteImages } from "@/lib/uploads";
import {
  SOCIAL_PLATFORMS,
  normalizeSocial,
  normalizeWebsite,
  normalizeWhatsapp,
} from "@/lib/social";

const schema = z.object({
  storeId: z.string().optional(), // present = edit; absent = create
  name: z.string().min(3).max(50),
  slug: z.string().regex(/^[a-z0-9-]{3,30}$/, "معرف المتجر: أحرف إنجليزية صغيرة وأرقام وشرطات فقط"),
  description: z.string().max(500).optional().or(z.literal("")),
  // social profiles: handle or full URL, normalized/validated below
  website: z.string().max(200).optional(),
  twitter: z.string().max(200).optional(),
  instagram: z.string().max(200).optional(),
  tiktok: z.string().max(200).optional(),
  snapchat: z.string().max(200).optional(),
  youtube: z.string().max(200).optional(),
  whatsapp: z.string().max(30).optional(),
});

/** Normalize all social inputs; returns field→value or an error message. */
function normalizeSocials(
  data: z.infer<typeof schema>,
): { ok: true; fields: Record<string, string | null> } | { ok: false; error: string } {
  const fields: Record<string, string | null> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const result = normalizeSocial(platform, data[platform]);
    if (result && typeof result === "object") return { ok: false, error: result.error };
    fields[platform] = result;
  }
  const website = normalizeWebsite(data.website);
  if (website && typeof website === "object") return { ok: false, error: website.error };
  fields.website = website;
  const whatsapp = normalizeWhatsapp(data.whatsapp);
  if (whatsapp && typeof whatsapp === "object") return { ok: false, error: whatsapp.error };
  fields.whatsapp = whatsapp;
  return { ok: true, fields };
}

/** Create a new store (within plan limit) or edit an existing one. */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "store-write", 10, 10 * 60_000);
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: apiMessage(req, parsed.error.issues[0]?.message ?? "بيانات غير صالحة") },
      { status: 400 },
    );
  }
  const { storeId, name, slug } = parsed.data;
  const description = parsed.data.description || "";

  const socials = normalizeSocials(parsed.data);
  if (!socials.ok) {
    return NextResponse.json({ error: apiMessage(req, socials.error) }, { status: 400 });
  }

  const banned = await findBannedWord(`${name} ${description}`);
  if (banned) {
    return NextResponse.json(
      { error: apiMessage(req, "محتوى المتجر يخالف سياسات المنصة") },
      { status: 422 },
    );
  }

  // slug must be globally unique
  const slugTaken = await db.store.findFirst({
    where: { slug, ...(storeId ? { id: { not: storeId } } : {}) },
  });
  if (slugTaken) {
    return NextResponse.json({ error: apiMessage(req, "معرف المتجر محجوز") }, { status: 409 });
  }

  if (storeId) {
    // edit — must own it
    const existing = await db.store.findUnique({ where: { id: storeId } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: apiMessage(req, "غير مصرح") }, { status: 403 });
    }
    try {
      const store = await db.store.update({
        where: { id: storeId },
        data: { name, slug, description, ...socials.fields },
      });
      return NextResponse.json({ ok: true, slug: store.slug });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002")
        return NextResponse.json({ error: apiMessage(req, "معرف المتجر محجوز") }, { status: 409 });
      throw error;
    }
  }

  const limits = await getPlanLimits(user.isPro);
  try {
    const store = await db.$transaction(async (tx) => {
      await lockPublishingQuota(tx, user.id);
      if ((await tx.store.count({ where: { userId: user.id } })) >= limits.maxStores) return null;
      return tx.store.create({
        data: { userId: user.id, name, slug, description, ...socials.fields },
      });
    });
    if (!store)
      return NextResponse.json(
        { error: apiMessage(req, "وصلت الحد الأقصى للمتاجر في خطتك") },
        { status: 403 },
      );
    return NextResponse.json({ ok: true, id: store.id, slug: store.slug });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      return NextResponse.json({ error: apiMessage(req, "معرف المتجر محجوز") }, { status: 409 });
    throw error;
  }
}

/** Delete one of the user's stores. */
export async function DELETE(req: Request) {
  const limited = await rateLimitGuard(req, "store-delete", 10, 10 * 60_000);
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: apiMessage(req, "لا يوجد متجر") }, { status: 400 });
  const store = await db.store.findUnique({
    where: { id },
    include: { verification: { select: { docPath: true } } },
  });
  if (!store || store.userId !== user.id) {
    return NextResponse.json({ error: apiMessage(req, "غير مصرح") }, { status: 403 });
  }
  await db.$transaction(async (tx) => {
    await tx.store.delete({ where: { id } });
    await queuePublicImageCleanup(tx, [store.logoUrl, store.bannerUrl]);
  });
  await deleteImages([store.logoUrl, store.bannerUrl].filter((url): url is string => !!url));
  await deletePrivateImage(store.verification?.docPath);
  return NextResponse.json({ ok: true });
}
