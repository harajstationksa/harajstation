import { cancelListingAuction } from "@/lib/auction";
import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth";
import { deletePrivateImage } from "@/lib/uploads";
import { rateLimitGuard } from "@/lib/rate-limit";
import { consumeOtp, startOtpChallenge } from "@/lib/login-otp";
import { emailConfigured } from "@/lib/email";

const schema = z.object({
  password: z.string().max(200).optional(),
  challenge: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  code: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

/**
 * PDPL account deletion: verifies the password, anonymizes all personal data,
 * removes subscriptions/favorites/saved-searches, takes listings offline and
 * permanently blocks the account. Chat messages stay (the counterpart keeps
 * their conversation) but are attributed to «مستخدم محذوف».
 */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "account-delete", 5, 10 * 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role === "ADMIN") {
    return NextResponse.json(
      { error: apiMessage(req, "لا يمكن حذف حساب مدير — أزل صلاحية الإدارة أولاً") },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: apiMessage(req, "بيانات تحقق غير صالحة") }, { status: 400 });
  const oauthOnly = user.passwordHash.startsWith("oauth:");
  if (oauthOnly && (!parsed.data.challenge || !parsed.data.code)) {
    if (!emailConfigured())
      return NextResponse.json(
        { error: apiMessage(req, "خدمة التحقق بالبريد غير متاحة") },
        { status: 503 },
      );
    const proof = await startOtpChallenge(user, "ACCOUNT_DELETE");
    return proof.ok
      ? NextResponse.json({ requiresOtp: true, challenge: proof.challenge })
      : NextResponse.json({ error: apiMessage(req, proof.error) }, { status: 503 });
  }
  if (
    !oauthOnly &&
    (!parsed.data.password ||
      Buffer.byteLength(parsed.data.password) > 72 ||
      !(await compare(parsed.data.password, user.passwordHash)))
  ) {
    return NextResponse.json({ error: apiMessage(req, "كلمة المرور غير صحيحة") }, { status: 403 });
  }

  const [idReq, storeDocs] = await Promise.all([
    db.identityVerification.findUnique({ where: { userId: user.id } }),
    db.storeVerification.findMany({
      where: { store: { userId: user.id } },
      select: { docPath: true },
    }),
  ]);

  const changed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const fresh = await tx.user.findUnique({ where: { id: user.id } });
    if (
      !fresh ||
      fresh.isBanned ||
      fresh.sessionVersion !== user.sessionVersion ||
      fresh.passwordHash !== user.passwordHash ||
      fresh.email !== user.email
    )
      return false;
    if (oauthOnly) {
      const proof = await consumeOtp(
        tx,
        fresh,
        "ACCOUNT_DELETE",
        parsed.data.challenge!,
        parsed.data.code!,
      );
      if (!proof.ok) return false;
    }
    await Promise.all([
      // wipe personal data + make the account unusable
      tx.user.update({
        where: { id: user.id },
        data: {
          name: "مستخدم محذوف",
          email: `deleted-${user.id}@deleted.invalid`,
          phone: null,
          phoneVerified: false,
          avatarUrl: null,
          passwordHash: `deleted:${crypto.randomUUID()}`,
          isBanned: true, // blocks any live session (getCurrentUser rejects banned)
          sessionVersion: { increment: 1 },
          googleSub: null,
          emailVerifiedAt: null,
          twoFactorEmail: false,
          isPro: false,
          idVerified: false,
          points: 0,
        },
      }),
      // take the user's content offline
      tx.listing.updateMany({
        where: { sellerId: user.id },
        data: { status: "REMOVED", isPromoted: false, promotedUntil: null },
      }),
      tx.campaign.updateMany({
        where: { ownerId: user.id, status: "ACTIVE" },
        data: { status: "CANCELLED", endedAt: new Date() },
      }),
      // drop everything personal that has no value to other users
      tx.pushSubscription.deleteMany({ where: { userId: user.id } }),
      tx.savedSearch.deleteMany({ where: { userId: user.id } }),
      tx.favorite.deleteMany({ where: { userId: user.id } }),
      tx.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      tx.follow.deleteMany({
        where: { OR: [{ followerId: user.id }, { sellerId: user.id }] },
      }),
      tx.storeFollow.deleteMany({
        where: { OR: [{ userId: user.id }, { store: { userId: user.id } }] },
      }),
      tx.store.updateMany({
        where: { userId: user.id },
        data: {
          name: "متجر محذوف",
          description: "",
          logoUrl: null,
          bannerUrl: null,
          isVerified: false,
          website: null,
          twitter: null,
          instagram: null,
          tiktok: null,
          snapchat: null,
          youtube: null,
          whatsapp: null,
        },
      }),

      tx.storeVerification.deleteMany({ where: { store: { userId: user.id } } }),
      tx.identityVerification.deleteMany({ where: { userId: user.id } }),
      tx.notification.deleteMany({ where: { userId: user.id } }),
    ]);
    const liveAuctions = await tx.auction.findMany({
      where: { status: "LIVE", listing: { sellerId: user.id } },
      select: { listingId: true },
    });
    for (const auction of liveAuctions) await cancelListingAuction(tx, auction.listingId, false);
    await tx.loginOtp.deleteMany({ where: { userId: user.id } });
    await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    if (user.avatarUrl)
      await tx.backgroundJob.create({
        data: {
          kind: "AVATAR_CLEANUP",
          payload: JSON.stringify({ url: user.avatarUrl }),
        },
      });
    return true;
  });
  if (!changed)
    return NextResponse.json(
      { error: apiMessage(req, "انتهى التحقق أو تغير الحساب؛ حاول مجددًا") },
      { status: 409 },
    );

  await Promise.all([
    deletePrivateImage(idReq?.docPath),
    ...storeDocs.map((doc) => deletePrivateImage(doc.docPath)),
  ]);

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
