import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/** The signed-in user's own snapshot + badge counts for the app shell. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجل" }, { status: 401 });
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [unreadNotifications, unreadMessages, activeListings, favorites, stores] =
    await Promise.all([
      db.notification.count({ where: { userId: user.id, readAt: null } }),
      db.message.count({
        where: {
          readAt: null,
          senderId: { not: user.id },
          conversation: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
        },
      }),
      db.listing.count({ where: { sellerId: user.id, status: "ACTIVE" } }),
      db.favorite.count({ where: { userId: user.id } }),
      db.store.findMany({
        where: { userId: user.id },
        select: { id: true, slug: true, name: true, logoUrl: true, isVerified: true },
      }),
    ]);

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    city: user.city,
    role: user.role,
    avatarUrl: user.avatarUrl,
    avatarColor: user.avatarColor,
    credibility: user.credibility,
    successfulTx: user.successfulTx,
    points: user.points,
    isPro: user.isPro,
    proUntil: user.proUntil?.toISOString() ?? null,
    idVerified: user.idVerified,
    emailVerified: !!user.emailVerifiedAt,
    referralCode: user.referralCode,
    memberSince: user.createdAt.toISOString(),
    canClaimDaily: !user.lastDailyAt || user.lastDailyAt < startOfToday,
    counts: {
      unreadNotifications,
      unreadMessages,
      activeListings,
      favorites,
    },
    stores,
  });
}
