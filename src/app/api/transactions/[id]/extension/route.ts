import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { EXTENSION_MAX_DAYS } from "@/lib/constants";
import { notify } from "@/lib/notify";
import { rateLimitGuard } from "@/lib/rate-limit";

/**
 * Buyer-requested extension of the mutual-confirmation deadline.
 *   buyer  → { days, note? }              opens a PENDING request
 *   seller → { decision: APPROVE|REJECT } decides it
 * One request per transaction: the deadline drives credibility penalties, so
 * an unlimited "ask again" would let either side stall the window forever.
 */
const schema = z.union([
  z.object({
    days: z.number().int().min(1).max(EXTENSION_MAX_DAYS),
    note: z.string().trim().max(300).optional(),
  }),
  z.object({ decision: z.enum(["APPROVE", "REJECT"]) }),
]);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await rateLimitGuard(req, "tx-extension", 10, 10 * 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const t = await db.transaction.findUnique({
    where: { id },
    include: { listing: { select: { title: true } } },
  });
  if (!t) {
    return NextResponse.json({ error: "المعاملة غير موجودة" }, { status: 404 });
  }
  if (t.status !== "PENDING") {
    return NextResponse.json({ error: "المعاملة مغلقة" }, { status: 409 });
  }

  const isSeller = t.sellerId === session.sub;
  const isBuyer = t.buyerId === session.sub;
  if (!isSeller && !isBuyer) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ── buyer asks for more time ──
  if ("days" in parsed.data) {
    if (!isBuyer) {
      return NextResponse.json(
        { error: "طلب التمديد متاح للمشتري فقط" },
        { status: 403 }
      );
    }
    if (t.buyerAnswer) {
      return NextResponse.json(
        { error: "سبق أن أجبت على هذه المعاملة" },
        { status: 409 }
      );
    }
    if (t.extStatus) {
      return NextResponse.json(
        { error: "لا يمكن طلب التمديد أكثر من مرة" },
        { status: 409 }
      );
    }
    if (t.deadline.getTime() <= Date.now()) {
      return NextResponse.json({ error: "انتهت المهلة" }, { status: 409 });
    }

    await db.transaction.update({
      where: { id },
      data: {
        extStatus: "PENDING",
        extDays: parsed.data.days,
        extNote: parsed.data.note || null,
        extAskedAt: new Date(),
      },
    });
    await notify(
      t.sellerId,
      "CONFIRM",
      "طلب تمديد مهلة التحقق",
      `طلب المشتري تمديد مهلة تأكيد "${t.listing.title}" ${parsed.data.days} أيام إضافية. وافق أو ارفض من صفحة التحقق.`,
      "/dashboard/verifications"
    );
    return NextResponse.json({ ok: true });
  }

  // ── seller decides ──
  if (!isSeller) {
    return NextResponse.json(
      { error: "القرار للبائع فقط" },
      { status: 403 }
    );
  }
  if (t.extStatus !== "PENDING") {
    return NextResponse.json(
      { error: "لا يوجد طلب تمديد قيد الانتظار" },
      { status: 409 }
    );
  }

  const approved = parsed.data.decision === "APPROVE";
  const days = t.extDays ?? 0;
  // extend from the current deadline, not from now — approving late must not
  // shorten the window the buyer asked for
  await db.transaction.update({
    where: { id },
    data: {
      extStatus: approved ? "APPROVED" : "REJECTED",
      ...(approved
        ? { deadline: new Date(t.deadline.getTime() + days * 86_400_000) }
        : {}),
    },
  });
  await notify(
    t.buyerId,
    "CONFIRM",
    approved ? "تمت الموافقة على التمديد" : "رُفض طلب التمديد",
    approved
      ? `وافق البائع على تمديد مهلة تأكيد "${t.listing.title}" ${days} أيام إضافية.`
      : `رفض البائع تمديد مهلة تأكيد "${t.listing.title}" — أكّد الاستلام قبل انتهاء المهلة الحالية.`,
    "/dashboard/verifications"
  );

  return NextResponse.json({ ok: true });
}
