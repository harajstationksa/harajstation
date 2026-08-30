import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { getAdminCurrentUser } from "@/lib/auth";
import { privateUploadPath } from "@/lib/uploads";

/** Serve an ID document to staff only — the file lives outside /public. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getAdminCurrentUser(["ADMIN", "MODERATOR", "SUPPORT"]);
  if (!user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const request = await db.identityVerification.findUnique({ where: { id } });
  if (!request) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // path is server-generated, but normalize defensively anyway
  const full = privateUploadPath(request.docPath);
  if (!full) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }

  try {
    const buf = await readFile(full);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
  }
}
