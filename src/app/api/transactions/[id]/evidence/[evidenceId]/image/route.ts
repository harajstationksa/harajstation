import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { privateImageResponse } from "@/lib/private-storage";

/** A dispute photo, for the two parties of the transaction only. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; evidenceId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, evidenceId } = await ctx.params;
  const evidence = await db.evidence.findUnique({
    where: { id: evidenceId },
    include: { dispute: { include: { transaction: { select: { id: true, buyerId: true, sellerId: true } } } } },
  });
  const tx = evidence?.dispute.transaction;
  if (
    !evidence?.fileUrl?.startsWith("private:") ||
    !tx ||
    tx.id !== id ||
    (tx.buyerId !== session.sub && tx.sellerId !== session.sub)
  ) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return privateImageResponse(evidence.fileUrl.slice("private:".length));
}
