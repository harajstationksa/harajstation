import Link from "next/link";
import type { Prisma } from "@prisma/client";
import {
  BadgeCheck,
  Ban,
  Crown,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { AdminUserActions } from "@/components/AdminUserActions";
import { CredibilityBadge } from "@/components/CredibilityBadge";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export const metadata = { title: "إدارة المستخدمين" };

const PAGE_SIZE = 20;

/** users registered after this moment count as "new this week" */
function weekAgo() {
  return new Date(Date.now() - 7 * 86_400_000);
}

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "الكل" },
  { key: "pro", label: "مشتركو برو" },
  { key: "verified", label: "موثّقون" },
  { key: "banned", label: "محظورون" },
  { key: "staff", label: "طاقم العمل" },
];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff(["ADMIN", "MODERATOR", "SUPPORT"]);
  const canBan = ["ADMIN", "MODERATOR"].includes(staff.role);
  const canAdjust = ["ADMIN", "SUPPORT"].includes(staff.role);
  const canPro = staff.role === "ADMIN";

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const filter = typeof sp.filter === "string" ? sp.filter : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.UserWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {}),
    ...(filter === "pro" ? { isPro: true } : {}),
    ...(filter === "verified" ? { idVerified: true } : {}),
    ...(filter === "banned" ? { isBanned: true } : {}),
    ...(filter === "staff" ? { role: { not: "USER" } } : {}),
  };

  const [users, total, statTotal, statPro, statVerified, statBanned, statNew] =
    await Promise.all([
      db.user.findMany({
        where,
        include: { _count: { select: { listings: true } } },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      db.user.count({ where }),
      db.user.count(),
      db.user.count({ where: { isPro: true } }),
      db.user.count({ where: { idVerified: true } }),
      db.user.count({ where: { isBanned: true } }),
      db.user.count({ where: { createdAt: { gte: weekAgo() } } }),
    ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageLink = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (filter) params.set("filter", filter);
    if (p > 1) params.set("page", String(p));
    return `/admin/users${params.size ? `?${params}` : ""}`;
  };

  const stats = [
    { icon: Users, label: "إجمالي المستخدمين", value: statTotal, tile: "bg-neutral-100 text-neutral-600 border-neutral-200" },
    { icon: Crown, label: "مشتركو برو", value: statPro, tile: "bg-amber-50 text-amber-600 border-amber-100" },
    { icon: BadgeCheck, label: "هويات موثّقة", value: statVerified, tile: "bg-green-50 text-green-600 border-green-100" },
    { icon: UserPlus, label: "جدد هذا الأسبوع", value: statNew, tile: "bg-blue-50 text-blue-600 border-blue-100" },
    { icon: Ban, label: "محظورون", value: statBanned, tile: "bg-red-50 text-red-500 border-red-100" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="section-title">إدارة المستخدمين</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {total.toLocaleString("en-US")} مستخدم{q || filter ? " مطابق" : " مسجل"}
            {!canBan && " — صلاحيتك: عرض فقط"}
          </p>
        </div>
        <form action="/admin/users" className="relative">
          {filter && <input type="hidden" name="filter" value={filter} />}
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400 pointer-events-none" />
          <input
            name="q"
            defaultValue={q}
            placeholder="ابحث بالاسم أو البريد أو الجوال…"
            className="input !py-2 !pr-9 w-72 max-w-full text-sm"
          />
        </form>
      </div>

      {/* ── stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map(({ icon: Icon, label, value, tile }) => (
          <div key={label} className="card p-3.5 flex items-center gap-3">
            <span className={`size-9 rounded-lg border flex items-center justify-center shrink-0 ${tile}`}>
              <Icon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="font-display font-extrabold text-lg tabular-nums leading-tight">
                {value.toLocaleString("en-US")}
              </p>
              <p className="text-[11px] text-neutral-500 line-clamp-1">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── filter chips ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          if (f.key) params.set("filter", f.key);
          return (
            <Link
              key={f.key}
              href={`/admin/users${params.size ? `?${params}` : ""}`}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                active
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {users.length === 0 ? (
        <EmptyState title="لا يوجد مستخدمون مطابقون" hint="جرّب كلمة بحث أو فلتراً آخر" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-200">
            <thead>
              <tr className="border-b border-neutral-100 text-right text-xs text-neutral-500 bg-neutral-50/60">
                <th className="p-3 font-semibold">المستخدم</th>
                <th className="p-3 font-semibold">الجوال</th>
                <th className="p-3 font-semibold">المصداقية</th>
                <th className="p-3 font-semibold">النقاط</th>
                <th className="p-3 font-semibold">الإعلانات</th>
                <th className="p-3 font-semibold">الاشتراك</th>
                <th className="p-3 font-semibold">التسجيل</th>
                <th className="p-3 font-semibold">الحالة</th>
                <th className="p-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-neutral-50/60">
                  <td className="p-3">
                    <div className="flex items-center gap-2.5">
                      {u.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.avatarUrl}
                          alt=""
                          className="size-9 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <span
                          className="size-9 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                          style={{ backgroundColor: u.avatarColor }}
                        >
                          {u.name.charAt(0)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold flex items-center gap-1.5">
                          <span className="line-clamp-1">{u.name}</span>
                          {u.idVerified && (
                            <BadgeCheck className="size-4 text-green-600 shrink-0" aria-label="موثّق" />
                          )}
                        </p>
                        <p className="text-xs text-neutral-400 line-clamp-1">
                          {ROLE_LABELS[u.role] ?? u.role} · {u.city}
                          {u.email ? (
                            <>
                              {" · "}
                              <span dir="ltr">{u.email}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-xs text-neutral-500" dir="ltr">{u.phone}</td>
                  <td className="p-3"><CredibilityBadge score={u.credibility} compact /></td>
                  <td className="p-3 tabular-nums text-amber-600 font-semibold">{u.points}</td>
                  <td className="p-3 tabular-nums">{u._count.listings}</td>
                  <td className="p-3">
                    {u.isPro ? (
                      <div>
                        <span className="badge bg-neutral-900 text-amber-400 text-[10px]">
                          <Crown className="size-3" />
                          PRO
                        </span>
                        <p className="text-[10px] text-neutral-400 mt-0.5">
                          {u.proUntil ? `حتى ${formatDate(u.proUntil)}` : "دائم"}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-neutral-500">{formatDate(u.createdAt)}</td>
                  <td className="p-3">
                    {u.isBanned ? (
                      <span className="badge bg-red-50 text-red-600">محظور</span>
                    ) : (
                      <span className="badge bg-green-50 text-green-700">نشط</span>
                    )}
                  </td>
                  <td className="p-3">
                    <AdminUserActions
                      user={{
                        id: u.id,
                        name: u.name,
                        email: u.email,
                        role: u.role,
                        isPro: u.isPro,
                        proUntil: u.proUntil ? u.proUntil.toISOString() : null,
                        isBanned: u.isBanned,
                        avatarColor: u.avatarColor,
                        avatarUrl: u.avatarUrl,
                      }}
                      canBan={canBan}
                      canAdjust={canAdjust}
                      canPro={canPro}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          {page > 1 && (
            <Link href={pageLink(page - 1)} className="btn-secondary !min-h-9 !px-4 text-xs">
              السابق
            </Link>
          )}
          <span className="text-sm text-neutral-500 tabular-nums">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={pageLink(page + 1)} className="btn-secondary !min-h-9 !px-4 text-xs">
              التالي
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
