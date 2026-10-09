import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminCurrentUser } from "@/lib/auth";
import { privateImageResponse } from "@/lib/private-storage";

/** A dispute photo for the support staff who decide disputes. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAdminCurrentUser(["ADMIN", "SUPPORT"], "disputes.view");
  if (!user) {
    return NextResponse.json({ error: apiMessage(_req, "غير مصرح") }, { status: 403 });
  }
  const { id } = await ctx.params;
  const evidence = await db.evidence.findUnique({ where: { id }, select: { fileUrl: true } });
  if (!evidence?.fileUrl?.startsWith("private:")) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return privateImageResponse(evidence.fileUrl.slice("private:".length));
}
