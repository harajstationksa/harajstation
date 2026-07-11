import { UserCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { approveIdentityAction, rejectIdentityAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "توثيق الهوية" };

export default async function AdminIdentityPage() {
  await requireStaff(["ADMIN", "MODERATOR"]);

  const requests = await db.identityVerification.findMany({
    include: { user: true },
    orderBy: [{ status: "desc" }, { createdAt: "asc" }],
    take: 100,
  });
  const pending = requests.filter((r) => r.status === "PENDING");
  const reviewed = requests.filter((r) => r.status !== "PENDING");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <UserCheck className="size-6 text-primary-600" />
          توثيق الهوية
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          {pending.length} طلب بانتظار المراجعة — الموافقة تمنح المستخدم شارة «موثّق»
        </p>
      </div>

      {pending.length === 0 ? (
        <EmptyState title="لا توجد طلبات توثيق معلّقة" />
      ) : (
        <div className="grid gap-3">
          {pending.map((r) => (
            <div key={r.id} className="card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar
                  name={r.user.name}
                  color={r.user.avatarColor}
                  src={r.user.avatarUrl}
                  className="size-10 text-sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm">{r.user.name}</p>
                  <p className="text-xs text-neutral-400">
                    {r.user.email} · {r.user.city} ·{" "}
                    <span suppressHydrationWarning>{timeAgo(r.createdAt)}</span>
                  </p>
                </div>
              </div>

              {/* the document itself — served through the staff-only API */}
              <a
                href={`/api/identity/doc/${r.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl overflow-hidden border border-neutral-200 bg-neutral-50 max-w-md"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/identity/doc/${r.id}`}
                  alt="وثيقة الهوية"
                  className="w-full max-h-72 object-contain"
                />
              </a>

              <div className="flex items-center gap-2 flex-wrap">
                <form action={approveIdentityAction}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <button className="badge bg-green-600 text-white cursor-pointer hover:bg-green-700">
                    توثيق الحساب ✓
                  </button>
                </form>
                <form action={rejectIdentityAction} className="flex items-center gap-2 flex-wrap">
                  <input type="hidden" name="requestId" value={r.id} />
                  <input
                    name="note"
                    placeholder="سبب الرفض (اختياري)"
                    className="input !py-1.5 !text-xs w-48"
                  />
                  <button className="badge bg-red-600 text-white cursor-pointer hover:bg-red-700">
                    رفض
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {reviewed.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm">
            طلبات سابقة
          </div>
          <ul className="divide-y divide-neutral-50">
            {reviewed.slice(0, 30).map((r) => (
              <li key={r.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
                <span className="line-clamp-1 text-neutral-600">
                  {r.user.name}
                  {r.note ? ` — ${r.note}` : ""}
                </span>
                <span
                  className={`badge shrink-0 ${
                    r.status === "APPROVED"
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  {r.status === "APPROVED" ? "موثّق" : "مرفوض"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
