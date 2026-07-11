import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseImages } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { ChatThread } from "@/components/ChatThread";
import { ReportButton } from "@/components/ReportButton";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const conv = await db.conversation.findUnique({
    where: { id },
    include: { listing: { include: { auction: true } }, buyer: true, seller: true },
  });
  if (!conv || (conv.buyerId !== user.id && conv.sellerId !== user.id)) notFound();

  const other = conv.buyerId === user.id ? conv.seller : conv.buyer;
  const listingHref = conv.listing.auction
    ? `/auctions/${conv.listing.auction.id}`
    : `/listings/${conv.listing.id}`;

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/messages"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-primary-600"
      >
        <ChevronRight className="size-4" />
        كل الرسائل
      </Link>

      <div className="card p-3.5 flex items-center gap-3">
        <Avatar name={other.name} color={other.avatarColor} src={other.avatarUrl} className="size-11 text-base" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm flex items-center gap-2">
            <Link href={`/profile/${other.id}`} className="hover:text-primary-600">
              {other.name}
            </Link>
            <ReportButton targetType="USER" targetId={other.id} compact />
          </p>
          <Link href={listingHref} className="text-xs text-primary-600 hover:underline line-clamp-1">
            بخصوص: {conv.listing.title}
          </Link>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={parseImages(conv.listing.images)[0]}
          alt=""
          className="size-11 rounded-lg object-cover border border-neutral-100 shrink-0"
        />
      </div>

      <ChatThread conversationId={conv.id} />
    </div>
  );
}
