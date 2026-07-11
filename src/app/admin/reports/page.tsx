import Link from "next/link";
import { Flag } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { decryptText } from "@/lib/crypto";
import { timeAgo } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import { closeReportAction, hideCommentAction, removeListingAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "البلاغات" };

const TYPE_LABEL: Record<string, string> = {
  LISTING: "إعلان",
  USER: "مستخدم",
  COMMENT: "تعليق",
  MESSAGE: "رسالة",
};

async function targetContext(type: string, id: string) {
  switch (type) {
    case "LISTING": {
      const l = await db.listing.findUnique({ where: { id }, include: { seller: true } });
      return l ? { text: `${l.title} — البائع: ${l.seller.name}`, href: `/listings/${l.id}` } : null;
    }
    case "USER": {
      const u = await db.user.findUnique({ where: { id } });
      return u ? { text: `${u.name} (${u.email})`, href: `/profile/${u.id}` } : null;
    }
    case "COMMENT": {
      const c = await db.comment.findUnique({ where: { id }, include: { user: true, listing: true } });
      return c
        ? { text: `«${c.body.slice(0, 80)}» — ${c.user.name} على "${c.listing.title}"`, href: `/listings/${c.listingId}`, hidden: c.isHidden }
        : null;
    }
    case "MESSAGE": {
      const m = await db.message.findUnique({ where: { id }, include: { sender: true } });
      // decrypted for moderation: only reported messages surface to admins
      return m ? { text: `«${decryptText(m.body).slice(0, 80)}» — من ${m.sender.name}` } : null;
    }
    default:
      return null;
  }
}

export default async function AdminReportsPage() {
  await requireStaff(["ADMIN", "MODERATOR", "SUPPORT"]);

  const reports = await db.report.findMany({
    include: { reporter: true },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  const withContext = await Promise.all(
    reports.map(async (r) => ({
      ...r,
      ctx: await targetContext(r.targetType, r.targetId),
    }))
  );

  const open = withContext.filter((r) => r.status === "OPEN");
  const closed = withContext.filter((r) => r.status !== "OPEN");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <Flag className="size-6 text-red-600" />
          البلاغات
        </h1>
        <p className="text-sm text-neutral-500 mt-1">{open.length} بلاغ مفتوح</p>
      </div>

      {open.length === 0 ? (
        <EmptyState title="لا توجد بلاغات مفتوحة" />
      ) : (
        <div className="grid gap-3">
          {open.map((r) => (
            <div key={r.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm">
                    <span className="badge bg-red-50 text-red-600 ml-2">
                      {TYPE_LABEL[r.targetType] ?? r.targetType}
                    </span>
                    <span className="font-semibold">{r.reporter.name}</span>
                    <span className="text-neutral-400 text-xs mr-2" suppressHydrationWarning>
                      {timeAgo(r.createdAt)}
                    </span>
                  </p>
                  <p className="text-sm text-neutral-700">{r.reason}</p>
                  {r.ctx && (
                    <p className="text-xs text-neutral-500">
                      المحتوى المبلّغ عنه:{" "}
                      {r.ctx.href ? (
                        <Link href={r.ctx.href} className="text-primary-600 hover:underline">
                          {r.ctx.text}
                        </Link>
                      ) : (
                        r.ctx.text
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {r.targetType === "COMMENT" && r.ctx && (
                  <form action={hideCommentAction}>
                    <input type="hidden" name="commentId" value={r.targetId} />
                    <button className="badge bg-neutral-800 text-white cursor-pointer hover:bg-neutral-700">
                      {"hidden" in r.ctx && r.ctx.hidden ? "إظهار التعليق" : "إخفاء التعليق"}
                    </button>
                  </form>
                )}
                {r.targetType === "LISTING" && (
                  <form action={removeListingAction}>
                    <input type="hidden" name="listingId" value={r.targetId} />
                    <button className="badge bg-red-600 text-white cursor-pointer hover:bg-red-700">
                      حذف الإعلان
                    </button>
                  </form>
                )}
                <form action={closeReportAction}>
                  <input type="hidden" name="reportId" value={r.id} />
                  <input type="hidden" name="outcome" value="RESOLVED" />
                  <button className="badge bg-green-600 text-white cursor-pointer hover:bg-green-700">
                    تمت المعالجة
                  </button>
                </form>
                <form action={closeReportAction}>
                  <input type="hidden" name="reportId" value={r.id} />
                  <input type="hidden" name="outcome" value="DISMISSED" />
                  <button className="badge bg-neutral-200 text-neutral-700 cursor-pointer hover:bg-neutral-300">
                    رفض البلاغ
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm">
            بلاغات سابقة
          </div>
          <ul className="divide-y divide-neutral-50">
            {closed.slice(0, 20).map((r) => (
              <li key={r.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
                <span className="line-clamp-1 text-neutral-600">
                  [{TYPE_LABEL[r.targetType]}] {r.reason}
                </span>
                <span className={`badge shrink-0 ${r.status === "RESOLVED" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                  {r.status === "RESOLVED" ? "تمت المعالجة" : "مرفوض"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
