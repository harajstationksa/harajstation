import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimitGuard } from "@/lib/rate-limit";
import { deletePrivateImage, MAX_FILE, savePrivateImage } from "@/lib/uploads";

const schema = z.object({ note: z.string().trim().min(10).max(2000) });
/** Evidence rows per party per dispute — enough for a full account of events. */
const MAX_EVIDENCE_PER_PARTY = 20;

/**
 * A party adds a statement — optionally with one photo (receipt, the item,
 * a chat screenshot) — to an OPEN dispute. Photos are private: only the two
 * parties and support staff can open them.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitGuard(req, "tx-evidence", 10, 10 * 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let note: unknown = null;
  let image: File | null = null;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    note = fd?.get("note") ?? null;
    const file = fd?.get("image");
    if (file instanceof File && file.size > 0) image = file;
  } else {
    note = ((await req.json().catch(() => null)) as { note?: unknown } | null)?.note ?? null;
  }
  const parsed = schema.safeParse({ note });
  if (!parsed.success) {
    return NextResponse.json(
      { error: apiMessage(req, "اكتب إفادة لا تقل عن 10 أحرف") },
      { status: 400 },
    );
  }
  if (image && image.size > MAX_FILE) {
    return NextResponse.json(
      { error: apiMessage(req, "حجم الصورة يتجاوز 5 ميجابايت") },
      { status: 400 },
    );
  }

  const t = await db.transaction.findUnique({
    where: { id },
    include: { dispute: true },
  });
  if (!t || !t.dispute) {
    return NextResponse.json(
      { error: apiMessage(req, "لا يوجد نزاع على هذه المعاملة") },
      { status: 404 },
    );
  }
  if (t.sellerId !== session.sub && t.buyerId !== session.sub) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (t.dispute.status !== "OPEN") {
    return NextResponse.json({ error: apiMessage(req, "النزاع مغلق") }, { status: 409 });
  }
  const mine = await db.evidence.count({
    where: { disputeId: t.dispute.id, userId: session.sub },
  });
  if (mine >= MAX_EVIDENCE_PER_PARTY) {
    return NextResponse.json(
      { error: apiMessage(req, "وصلت الحد الأقصى للإفادات في هذا النزاع") },
      { status: 409 },
    );
  }

  let fileUrl: string | null = null;
  if (image) {
    const saved = await savePrivateImage(image, "evidence");
    if (!saved.ok) {
      return NextResponse.json({ error: apiMessage(req, saved.error) }, { status: 400 });
    }
    fileUrl = `private:${saved.path}`;
  }
  try {
    await db.evidence.create({
      data: { disputeId: t.dispute.id, userId: session.sub, note: parsed.data.note, fileUrl },
    });
  } catch (error) {
    if (fileUrl) await deletePrivateImage(fileUrl.slice("private:".length));
    throw error;
  }

  return NextResponse.json({ ok: true });
}
