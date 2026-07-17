import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/** Lightweight unread-notifications count — polled by the header bell. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ unread: 0 });

  const unread = await db.notification.count({
    where: { userId: session.sub, readAt: null },
  });
  return NextResponse.json({ unread });
}
