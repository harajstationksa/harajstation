import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/constants";
import { privateUploadsRoot } from "@/lib/uploads";

/** Serve a store-verification document to staff only — lives outside /public. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !STAFF_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const request = await db.storeVerification.findUnique({ where: { id } });
  if (!request) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // path is server-generated, but normalize defensively anyway
  const root = privateUploadsRoot();
  const full = normalize(join(root, request.docPath));
  if (!full.startsWith(root)) {
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
