import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { savePrivateImage } from "@/lib/uploads";
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
    return NextResponse.json({ error: "حسابك موثّق بالفعل" }, { status: 400 });
  }

  const existing = await db.identityVerification.findUnique({
    where: { userId: user.id },
  });
  if (existing?.status === "PENDING") {
    return NextResponse.json(
      { error: "طلبك قيد المراجعة بالفعل — سنعلمك فور مراجعته" },
      { status: 409 }
    );
  }

  const fd = await req.formData().catch(() => null);
  const file = fd?.get("document");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "أرفق صورة الهوية" }, { status: 400 });
  }

  const saved = await savePrivateImage(file, "identity");
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  await db.identityVerification.upsert({
    where: { userId: user.id },
    create: { userId: user.id, docPath: saved.path },
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
