import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { deletePrivateImage, savePrivateImage } from "@/lib/uploads";
import { rateLimitGuard } from "@/lib/rate-limit";

/** Current user's identity-verification status. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const req = await db.identityVerification.findUnique({
    where: { userId: user.id },
    select: { status: true, note: true, createdAt: true, reviewedAt: true },
  });
  return NextResponse.json({
    verified: user.idVerified,
    request: req,
  });
}

/**
 * Submit (or re-submit after rejection) an ID document for manual review.
 * The image is stored outside /public and is only viewable by staff.
 */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "identity", 5, 10 * 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.idVerified) {
    return NextResponse.json({ error: apiMessage(req, "حسابك موثّق بالفعل") }, { status: 400 });
  }

  const existing = await db.identityVerification.findUnique({
    where: { userId: user.id },
  });
  if (existing?.status === "PENDING") {
    return NextResponse.json(
      { error: apiMessage(req, "طلبك قيد المراجعة بالفعل — سنعلمك فور مراجعته") },
      { status: 409 },
    );
  }

  const fd = await req.formData().catch(() => null);
  const file = fd?.get("document");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: apiMessage(req, "أرفق صورة الهوية") }, { status: 400 });
  }

  const saved = await savePrivateImage(file, "identity");
  if (!saved.ok) {
    return NextResponse.json({ error: apiMessage(req, saved.error) }, { status: 400 });
  }

  const result = await db
    .$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      const currentOwner = await tx.user.findUnique({ where: { id: user.id } });
      const current = await tx.identityVerification.findUnique({
        where: { userId: user.id },
      });
      if (
        !currentOwner ||
        currentOwner.idVerified ||
        (current && current.status !== "REJECTED") ||
        (current?.id ?? null) !== (existing?.id ?? null) ||
        (current?.docPath ?? null) !== (existing?.docPath ?? null)
      )
        return { ok: false as const };
      // A new id binds the review to this document, never a previous submission.
      if (current) await tx.identityVerification.delete({ where: { id: current.id } });
      await tx.identityVerification.create({
        data: { userId: user.id, docPath: saved.path },
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
