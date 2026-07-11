import { Scale } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { formatSAR, timeAgo } from "@/lib/utils";
import { CredibilityBadge } from "@/components/CredibilityBadge";
import { EmptyState } from "@/components/EmptyState";
import { resolveDisputeAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "إدارة النزاعات" };

export default async function AdminDisputesPage() {
  await requireStaff(["ADMIN", "SUPPORT"]);

  const disputes = await db.dispute.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      transaction: {
        include: { listing: true, seller: true, buyer: true },
      },
      evidences: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
  });

  const open = disputes.filter((d) => d.status === "OPEN");
  const resolved = disputes.filter((d) => d.status === "RESOLVED");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <Scale className="size-6 text-amber-600" />
          إدارة النزاعات
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          {open.length} نزاع مفتوح — القرار يمنح الطرف الصادق +5 نقاط ويخصم من
          الطرف المخالف 15 نقطة
        </p>
      </div>

      {open.length === 0 ? (
        <EmptyState title="لا توجد نزاعات مفتوحة" hint="جميع المعاملات تسير بسلام" />
      ) : (
        open.map((d) => {
          const t = d.transaction;
          return (
            <div key={d.id} className="card p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{t.listing.title}</p>
                  <p className="text-sm text-neutral-500 mt-0.5" suppressHydrationWarning>
                    {formatSAR(t.amount)} · فُتح النزاع {timeAgo(d.createdAt)}
                  </p>
                </div>
                <span className="badge bg-red-50 text-red-600 shrink-0">مفتوح</span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { label: "البائع", user: t.seller, answer: t.sellerAnswer },
                  { label: "المشتري", user: t.buyer, answer: t.buyerAnswer },
                ].map(({ label, user, answer }) => (
                  <div key={label} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3 space-y-1.5">
                    <p className="text-xs text-neutral-500">{label}</p>
                    <p className="font-semibold text-sm flex items-center gap-2">
                      {user.name}
                      <CredibilityBadge score={user.credibility} compact />
                    </p>
                    <p className="text-xs" dir="ltr">{user.phone}</p>
                    <p className="text-sm">
                      الإجابة:{" "}
                      <span className={answer === "YES" ? "text-green-700 font-bold" : "text-red-600 font-bold"}>
                        {answer === "YES" ? "نعم، تمت" : answer === "NO" ? "لا، لم تتم" : "لم يرد"}
                      </span>
                    </p>
                  </div>
                ))}
              </div>

              {d.evidences.length > 0 && (
                <div className="space-y-2">
                  <p className="font-semibold text-sm">الإفادات المرفقة:</p>
                  {d.evidences.map((ev) => (
                    <div key={ev.id} className="rounded-lg border border-neutral-100 p-3 text-sm">
                      <p className="text-xs text-neutral-500 mb-1">
                        {ev.user.name}
                        {" — "}
                        <span suppressHydrationWarning>{timeAgo(ev.createdAt)}</span>
                      </p>
                      <p className="text-neutral-700 leading-relaxed">{ev.note}</p>
                    </div>
                  ))}
                </div>
              )}

              <form action={resolveDisputeAction} className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <input type="hidden" name="disputeId" value={d.id} />
                <p className="font-bold text-sm text-amber-900">إصدار القرار</p>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="favor" value="SELLER" required className="accent-primary-500" />
                    لصالح البائع ({t.seller.name})
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="favor" value="BUYER" className="accent-primary-500" />
                    لصالح المشتري ({t.buyer.name})
                  </label>
                </div>
                <textarea
                  name="resolution"
                  className="input min-h-20 py-2.5"
                  placeholder="ملخص القرار وسببه (يُسجل في النظام)..."
                  required
                  minLength={5}
                />
                <button className="btn-primary">إصدار القرار النهائي</button>
              </form>
            </div>
          );
        })
      )}

      {resolved.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm">
            نزاعات محلولة
          </div>
          <ul className="divide-y divide-neutral-50">
            {resolved.map((d) => (
              <li key={d.id} className="px-4 py-3 text-sm flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold line-clamp-1">{d.transaction.listing.title}</p>
                  <p className="text-xs text-neutral-500 line-clamp-1">
                    القرار لصالح {d.resolvedInFavorOf === "SELLER" ? "البائع" : "المشتري"} — {d.resolution}
                  </p>
                </div>
                <span className="badge bg-green-50 text-green-700 shrink-0">محلول</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
