import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { deletePrivateImage, savePrivateImage } from "@/lib/uploads";
import { rateLimitGuard } from "@/lib/rate-limit";

/**
 * Submit (or re-submit after rejection) a store-verification document —
 * commercial registration or freelance certificate — for manual staff review.
 * The image is stored outside /public and is only viewable by staff.
 * Approval sets Store.isVerified → «متجر موثّق» badge.
 */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "store-verify", 5, 10 * 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const fd = await req.formData().catch(() => null);
  const storeId = String(fd?.get("storeId") ?? "");
  const store = storeId ? await db.store.findUnique({ where: { id: storeId } }) : null;
  if (!store || store.userId !== user.id) {
    return NextResponse.json({ error: apiMessage(req, "غير مصرح") }, { status: 403 });
  }
  if (store.isVerified) {
    return NextResponse.json({ error: apiMessage(req, "المتجر موثّق بالفعل") }, { status: 400 });
  }

  const existing = await db.storeVerification.findUnique({
    where: { storeId: store.id },
  });
  if (existing?.status === "PENDING") {
    return NextResponse.json(
      { error: apiMessage(req, "طلبك قيد المراجعة بالفعل — سنعلمك فور مراجعته") },
      { status: 409 },
    );
  }

  const file = fd?.get("document");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: apiMessage(req, "أرفق صورة السجل التجاري أو وثيقة العمل الحر") },
      { status: 400 },
    );
  }

  const saved = await savePrivateImage(file, "store-verify");
  if (!saved.ok) {
    return NextResponse.json({ error: apiMessage(req, saved.error) }, { status: 400 });
  }

  const result = await db
    .$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      const currentOwner = await tx.store.findUnique({
        where: { id: store.id },
      });
      const current = await tx.storeVerification.findUnique({
        where: { storeId: store.id },
      });
      if (
        !currentOwner ||
        currentOwner.isVerified ||
        (current && current.status !== "REJECTED") ||
        (current?.id ?? null) !== (existing?.id ?? null) ||
        (current?.docPath ?? null) !== (existing?.docPath ?? null)
      )
        return { ok: false as const };
      // A new id binds the review to this document, never a previous submission.
      if (current) await tx.storeVerification.delete({ where: { id: current.id } });
      await tx.storeVerification.create({
        data: { storeId: store.id, docPath: saved.path },
      });
      return { ok: true as const, oldPath: current?.docPath };
    })
    .catch(async (error) => {
      await deletePrivateImage(saved.path);
      throw error;
    });
  if (!result.ok) {
    await deletePrivateImage(saved.path);
    return NextResponse.json(
      { error: apiMessage(req, "تغير طلب التوثيق أثناء الرفع؛ حدّث الصفحة") },
      { status: 409 },
    );
  }
  if (result.oldPath && result.oldPath !== saved.path) await deletePrivateImage(result.oldPath);

  return NextResponse.json({ ok: true });
}
