import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CITIES } from "@/lib/constants";

const MAX_SAVED_SEARCHES = 20;

const schema = z.object({
  query: z.string().trim().max(80).default(""),
  category: z.string().trim().max(60).default(""),
  city: z.string().trim().max(40).default(""),
  type: z.enum(["", "STANDARD", "AUCTION"]).default(""),
});

/** Save a search → the user gets notified when a matching listing lands. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "سجّل دخولك أولاً" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const data = parsed.data;

  if (!data.query && !data.category && !data.city && !data.type) {
    return NextResponse.json(
      { error: "حدد كلمة بحث أو فلتراً واحداً على الأقل" },
      { status: 400 }
    );
  }
  if (data.city && !(CITIES as readonly string[]).includes(data.city)) {
    return NextResponse.json({ error: "مدينة غير معروفة" }, { status: 400 });
  }
  if (data.category) {
    const cat = await db.category.findUnique({ where: { slug: data.category } });
    if (!cat) {
      return NextResponse.json({ error: "فئة غير معروفة" }, { status: 400 });
    }
  }

  // duplicate → treat as success (idempotent save button)
  const existing = await db.savedSearch.findFirst({
    where: { userId: user.id, ...data },
  });
  if (existing) {
    return NextResponse.json({ ok: true, id: existing.id, duplicate: true });
  }

  const count = await db.savedSearch.count({ where: { userId: user.id } });
  if (count >= MAX_SAVED_SEARCHES) {
    return NextResponse.json(
      { error: `الحد الأقصى ${MAX_SAVED_SEARCHES} بحثاً محفوظاً — احذف بعض التنبيهات القديمة` },
      { status: 403 }
    );
  }

  const saved = await db.savedSearch.create({
    data: { userId: user.id, ...data },
  });
  return NextResponse.json({ ok: true, id: saved.id });
}
