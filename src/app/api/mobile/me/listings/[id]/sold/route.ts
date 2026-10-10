import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { markSoldWithBuyer, saleCandidates } from "@/lib/sale";
import { parseJson } from "../../../../_lib/serialize";

const NO_STORE = { "Cache-Control": "private, no-store" };
const schema = z.object({
  buyerId: z.string().max(64).default(""),
  amount: z.number().int().nonnegative().max(1_000_000_000).optional(),
});

/** Buyers the seller can pick for «تم البيع» (chats + offers on this listing). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: apiMessage(req, "غير مسجل") }, { status: 401 });
  const { id } = await ctx.params;
  const sale = await saleCandidates(user.id, id);
  if (!sale)
    return NextResponse.json(
      { error: apiMessage(req, "الإعلان غير متاح لتسجيل البيع") },
      { status: 404 },
    );
  const images = parseJson<string[]>(sale.listing.images, []);
  return NextResponse.json(
    {
      listing: {
        id: sale.listing.id,
        title: sale.listing.title,
        price: sale.listing.price,
        image: images[0] ?? null,
      },
      candidates: sale.candidates,
      suggestedAmount: sale.suggestedAmount,
    },
    { headers: NO_STORE },
  );
}

/** Close the listing; with a buyer it opens the mutual-confirmation deal. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: apiMessage(req, "غير مسجل") }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: apiMessage(req, "طلب غير صالح") }, { status: 400 });
  const result = await markSoldWithBuyer(
    user.id,
    id,
    parsed.data.buyerId,
    parsed.data.amount ?? Number.NaN,
  );
  if (!result.ok)
    return NextResponse.json(
      { error: apiMessage(req, "الإعلان غير مؤهل لتسجيل البيع") },
      { status: 409 },
    );
  return NextResponse.json(
    { ok: true, transactionCreated: result.txCreated },
    { headers: NO_STORE },
  );
}
