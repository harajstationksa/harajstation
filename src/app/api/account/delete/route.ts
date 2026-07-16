import { NextResponse } from "next/server";
import { z } from "zod";
import { compareSync } from "bcryptjs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth";
import { privateUploadsRoot } from "@/lib/uploads";
import { rateLimitGuard } from "@/lib/rate-limit";

const schema = z.object({ password: z.string().min(1) });

/**
 * PDPL account deletion: verifies the password, anonymizes all personal data,
 * removes subscriptions/favorites/saved-searches, takes listings offline and
 * permanently blocks the account. Chat messages stay (the counterpart keeps
 * their conversation) but are attributed to «مستخدم محذوف».
 */
export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "account-delete", 5, 10 * 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role === "ADMIN") {
    return NextResponse.json(
      { error: "لا يمكن حذف حساب مدير — أزل صلاحية الإدارة أولاً" },
      { status: 400 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !compareSync(parsed.data.password, user.passwordHash)) {
    return NextResponse.json(
      { error: "كلمة المرور غير صحيحة" },
      { status: 403 }
    );
  }

  // remove the private ID document, if any
  const idReq = await db.identityVerification.findUnique({
    where: { userId: user.id },
  });
  if (idReq) {
    await rm(join(privateUploadsRoot(), idReq.docPath), { force: true }).catch(() => {});
  }

  await db.$transaction([
    // wipe personal data + make the account unusable
    db.user.update({
      where: { id: user.id },
      data: {
        name: "مستخدم محذوف",
        email: `deleted-${user.id}@deleted.invalid`,
        phone: null,
        phoneVerified: false,
        avatarUrl: null,
        passwordHash: `deleted:${crypto.randomUUID()}`,
        isBanned: true, // blocks any live session (getCurrentUser rejects banned)
        isPro: false,
        idVerified: false,
        points: 0,
      },
    }),
    // take the user's content offline
    db.listing.updateMany({
      where: { sellerId: user.id },
      data: { status: "REMOVED", isPromoted: false, promotedUntil: null },
    }),
    db.campaign.updateMany({
      where: { ownerId: user.id, status: "ACTIVE" },
      data: { status: "CANCELLED", endedAt: new Date() },
    }),
    // drop everything personal that has no value to other users
    db.pushSubscription.deleteMany({ where: { userId: user.id } }),
    db.savedSearch.deleteMany({ where: { userId: user.id } }),
    db.favorite.deleteMany({ where: { userId: user.id } }),
    db.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    db.follow.deleteMany({
      where: { OR: [{ followerId: user.id }, { sellerId: user.id }] },
    }),
    db.storeFollow.deleteMany({
      where: { OR: [{ userId: user.id }, { store: { userId: user.id } }] },
    }),
    db.storeVerification.deleteMany({ where: { store: { userId: user.id } } }),
    db.identityVerification.deleteMany({ where: { userId: user.id } }),
    db.notification.deleteMany({ where: { userId: user.id } }),
  ]);

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
