import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { decryptText } from "@/lib/crypto";
import { parseImages, timeAgo } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";

export const dynamic = "force-dynamic";

export const metadata = { title: "الرسائل" };

export default async function MessagesPage() {
  const user = await requireUser();

  const convs = await db.conversation.findMany({
    where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
    include: {
      listing: true,
      buyer: true,
      seller: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  const unreadCounts = await db.message.groupBy({
    by: ["conversationId"],
    where: {
      conversation: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
      senderId: { not: user.id },
      readAt: null,
    },
    _count: true,
  });
  const unreadMap = Object.fromEntries(unreadCounts.map((u) => [u.conversationId, u._count]));

  // sort by latest message
  convs.sort((a, b) => {
    const ta = a.messages[0]?.createdAt ?? a.createdAt;
    const tb = b.messages[0]?.createdAt ?? b.createdAt;
    return tb.getTime() - ta.getTime();
  });

  return (
    <div className="space-y-5">
      <h1 className="section-title flex items-center gap-2">
        <MessageSquare className="size-6 text-primary-500" />
        الرسائل
      </h1>

      {convs.length === 0 ? (
        <EmptyState
          title="لا توجد محادثات بعد"
          hint="راسل أي بائع من صفحة إعلانه وستظهر المحادثة هنا"
        />
      ) : (
        <div className="card overflow-hidden divide-y divide-neutral-50">
          {convs.map((c) => {
            const other = c.buyerId === user.id ? c.seller : c.buyer;
            const last = c.messages[0];
            const unread = unreadMap[c.id] ?? 0;
            return (
              <Link
                key={c.id}
                href={`/dashboard/messages/${c.id}`}
                className="flex items-center gap-3 p-3.5 hover:bg-neutral-50 transition-colors"
              >
                <Avatar name={other.name} color={other.avatarColor} src={other.avatarUrl} className="size-11 text-base" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm">{other.name}</p>
                    {last && (
                      <span className="text-[11px] text-neutral-400 shrink-0" suppressHydrationWarning>
                        {timeAgo(last.createdAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 line-clamp-1 mt-0.5">
                    {last
                      ? decryptText(last.body) || (last.imageUrl ? "📷 صورة" : "")
                      : "محادثة جديدة"}
                  </p>
                  <p className="text-[11px] text-primary-600 line-clamp-1 mt-0.5">
                    {c.listing.title}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={parseImages(c.listing.images)[0]}
                    alt=""
                    className="size-10 rounded-lg object-cover border border-neutral-100"
                  />
                  {unread > 0 && (
                    <span className="badge bg-primary-500 text-white">{unread}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
