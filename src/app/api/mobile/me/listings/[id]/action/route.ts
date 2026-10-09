import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isRateLimited } from "@/lib/rate-limit";
import { featureListing, relistListing, removeOwnListing, lockListing } from "@/lib/listing-policy";

const schema = z.object({ action: z.enum(["feature", "sold", "relist", "delete"]) });
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: apiMessage(req, "غير مسجل") }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: apiMessage(req, "طلب غير صالح") }, { status: 400 });
  let ok = false;
  switch (parsed.data.action) {
    case "feature":
      ok = await featureListing(id, user.id);
      break;
    case "relist":
      if (await isRateLimited(`relist:${user.id}`, 20, 24 * 3600000))
        return NextResponse.json({ error: apiMessage(req, "محاولات كثيرة") }, { status: 429 });
      ok = await relistListing(id, user);
      break;
    case "delete":
      ok = await removeOwnListing(id, user.id);
      break;
    case "sold":
      ok = await db.$transaction(async (tx) => {
        await lockListing(tx, id);
        const listing = await tx.listing.findUnique({ where: { id }, include: { auction: true } });
        if (
          !listing ||
          listing.sellerId !== user.id ||
          listing.status !== "ACTIVE" ||
          listing.auction?.status === "LIVE"
        )
          return false;
        await tx.listing.update({
          where: { id },
          data: { status: "SOLD", isFeatured: false, isPromoted: false },
        });
        return true;
      });
      break;
  }
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json(
        {
          error: apiMessage(
            req,
            "الإعلان غير مؤهل لهذا الإجراء أو الرصيد/الحصة غير كافٍ. لا يمكن حذف مزاد به مشاركات أو معاملة.",
          ),
        },
        { status: 409 },
      );
}
