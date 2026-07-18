import { NextResponse } from "next/server";
import { z } from "zod";
import { compareSync } from "bcryptjs";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isValidDisplayName, normalizeSaudiPhone } from "@/lib/utils";
import { CITIES } from "@/lib/constants";
import { rateLimitGuard } from "@/lib/rate-limit";

const schema = z.object({
  name: z.string().min(2).max(60),
  city: z.enum(CITIES),
  phone: z.string().max(20).optional().or(z.literal("")),
  email: z.string().email().max(120).optional(),
  currentPassword: z.string().max(200).optional(),
});

export async function PATCH(req: Request) {
  const limited = await rateLimitGuard(req, "account-update", 10, 10 * 60_000);
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  if (!isValidDisplayName(parsed.data.name)) {
    return NextResponse.json(
      { error: "الاسم يجب أن يحتوي حروفاً حقيقية (عربية أو إنجليزية)" },
      { status: 400 }
    );
  }

  let phone: string | null = null;
  if (parsed.data.phone) {
    phone = normalizeSaudiPhone(parsed.data.phone);
    if (!phone) {
      return NextResponse.json(
        { error: "رقم الجوال غير صالح — مثال: 05XXXXXXXX" },
        { status: 400 }
      );
    }
    const taken = await db.user.findFirst({
      where: { phone, id: { not: user.id } },
    });
    if (taken) {
      return NextResponse.json(
        { error: "رقم الجوال مستخدم في حساب آخر" },
        { status: 409 }
      );
    }
  }

  // email change: the email is the account identifier, so it is guarded by
  // the current password and a uniqueness check
  const newEmail = parsed.data.email?.toLowerCase().trim();
  const emailChanged = !!newEmail && newEmail !== user.email;
  if (emailChanged) {
    if (!parsed.data.currentPassword) {
      return NextResponse.json(
        { error: "أدخل كلمة المرور الحالية لتغيير البريد الإلكتروني" },
        { status: 400 }
      );
    }
    if (!compareSync(parsed.data.currentPassword, user.passwordHash)) {
      return NextResponse.json(
        { error: "كلمة المرور الحالية غير صحيحة" },
        { status: 403 }
      );
    }
    const emailTaken = await db.user.findFirst({
      where: { email: newEmail, id: { not: user.id } },
    });
    if (emailTaken) {
      return NextResponse.json(
        { error: "هذا البريد مستخدم في حساب آخر" },
        { status: 409 }
      );
    }
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      city: parsed.data.city,
      phone,
      // changing the number resets verification (future OTP flow)
      phoneVerified: phone === user.phone ? user.phoneVerified : false,
      ...(emailChanged ? { email: newEmail } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
