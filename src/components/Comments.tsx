import { MessagesSquare } from "lucide-react";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { CommentForm } from "./CommentForm";
import { ReportButton } from "./ReportButton";

export async function Comments({
  listingId,
  sellerId,
  loggedIn,
}: {
  listingId: string;
  sellerId: string;
  loggedIn: boolean;
}) {
  const { lang, t } = await getT();
  const comments = await db.comment.findMany({
    where: { listingId, isHidden: false },
    include: { user: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  return (
    <div className="card p-5 space-y-4">
      <h2 className="font-bold flex items-center gap-2">
        <MessagesSquare className="size-5 text-primary-500" />
        {t.comments.title} ({comments.length})
      </h2>

      {comments.length > 0 && (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              <Avatar name={c.user.name} color={c.user.avatarColor} src={c.user.avatarUrl} className="size-8 text-xs" />
              <div className="flex-1 min-w-0 rounded-xl bg-neutral-50 border border-neutral-100 px-3 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-xs">{c.user.name}</span>
                  {c.userId === sellerId && (
                    <span className="badge bg-primary-100 text-primary-700 text-[10px]">{t.comments.seller}</span>
                  )}
                  <span className="text-[11px] text-neutral-400" suppressHydrationWarning>
                    {timeAgo(c.createdAt, lang)}
                  </span>
                  <span className="mr-auto">
                    <ReportButton targetType="COMMENT" targetId={c.id} compact />
                  </span>
                </div>
                <p className="text-sm text-neutral-700 mt-1 leading-relaxed">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CommentForm listingId={listingId} loggedIn={loggedIn} />
    </div>
  );
}
