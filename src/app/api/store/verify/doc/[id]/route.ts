import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminCurrentUser } from "@/lib/auth";
import { privateImageResponse } from "@/lib/private-storage";

/** Serve a store-verification document to staff only — lives outside /public. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAdminCurrentUser(["ADMIN", "MODERATOR"], "stores.view");
  if (!user) {
    return NextResponse.json({ error: apiMessage(_req, "غير مصرح") }, { status: 403 });
  }

  const { id } = await ctx.params;
  const request = await db.storeVerification.findUnique({ where: { id } });
  if (!request) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // path is server-generated, but normalize defensively anyway
  return privateImageResponse(request.docPath);
}
