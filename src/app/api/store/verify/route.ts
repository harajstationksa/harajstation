import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { savePrivateImage } from "@/lib/uploads";
import { rateLimitGuard } from "@/lib/rate-limit";

/**
 * Submit (or re-submit after rejection) a store-verification document —
 * commercial registration or freelance certificate — for manual staff review.
 * The image is stored outside /public and is only viewable by staff.
 * Approval sets Store.isVerified → «متجر موثّق» badge.
 */
export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "store-verify", 5, 10 * 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const fd = await req.formData().catch(() => null);
  const storeId = String(fd?.get("storeId") ?? "");
  const store = storeId
    ? await db.store.findUnique({ where: { id: storeId } })
    : null;
  if (!store || store.userId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (store.isVerified) {
    return NextResponse.json({ error: "المتجر موثّق بالفعل" }, { status: 400 });
  }

  const existing = await db.storeVerification.findUnique({
    where: { storeId: store.id },
  });
  if (existing?.status === "PENDING") {
    return NextResponse.json(
      { error: "طلبك قيد المراجعة بالفعل — سنعلمك فور مراجعته" },
      { status: 409 }
    );
  }

  const file = fd?.get("document");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "أرفق صورة السجل التجاري أو وثيقة العمل الحر" },
      { status: 400 }
    );
  }

  const saved = await savePrivateImage(file, "store-verify");
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  await db.storeVerification.upsert({
    where: { storeId: store.id },
    create: { storeId: store.id, docPath: saved.path },
    update: {
      docPath: saved.path,
      status: "PENDING",
      note: null,
      createdAt: new Date(),
      reviewedAt: null,
    },
  });

  return NextResponse.json({ ok: true });
}
