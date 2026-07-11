import Link from "next/link";
import { FileSearch, Hash, ListChecks, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { normalizeArabic } from "@/lib/arabic";
import { LISTING_STATUS, ROLE_LABELS } from "@/lib/constants";
import { formatSAR, parseImages, timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { CredibilityBadge } from "@/components/CredibilityBadge";

export const dynamic = "force-dynamic";

export const metadata = { title: "بحث الإدارة" };

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireStaff(["ADMIN", "MODERATOR", "SUPPORT"]);
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  if (!query) {
    return (
      <div className="space-y-4">
        <h1 className="section-title">بحث الإدارة</h1>
        <p className="text-sm text-neutral-500">
          ابحث برقم الإعلان المرجعي (مثل SM-100001)، أو عنوان الإعلان، أو اسم /
          بريد / جوال المستخدم — من شريط البحث أعلى اللوحة.
        </p>
      </div>
    );
  }

  const norm = normalizeArabic(query);
  const refQuery = query.toUpperCase().startsWith("SM-")
    ? query.toUpperCase()
    : /^\d{4,}$/.test(query)
      ? `SM-${query}`
      : null;

  const [listings, users] = await Promise.all([
    db.listing.findMany({
      where: {
        OR: [
          ...(refQuery ? [{ ref: refQuery }] : []),
          { ref: query.toUpperCase() },
          { id: query },
          { title: { contains: query } },
          { searchText: { contains: norm } },
        ],
      },
      include: { seller: true, auction: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.user.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { email: { contains: query.toLowerCase() } },
          { phone: { contains: query.replace(/^0/, "") } },
          { id: query },
        ],
      },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <FileSearch className="size-6 text-primary-500" />
          نتائج البحث عن «{query}»
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          {listings.length} إعلان · {users.length} مستخدم
        </p>
      </div>

      {/* listings */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm flex items-center gap-2">
          <ListChecks className="size-4 text-neutral-400" />
          الإعلانات
        </div>
        {listings.length === 0 ? (
          <p className="p-6 text-sm text-neutral-400 text-center">لا توجد إعلانات مطابقة</p>
        ) : (
          <ul className="divide-y divide-neutral-50">
            {listings.map((l) => (
              <li key={l.id} className="px-4 py-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={parseImages(l.images)[0]} alt="" className="size-12 rounded-lg object-cover border border-neutral-100 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge bg-neutral-900 text-white font-mono text-[10px]">
                      <Hash className="size-3" />
                      {l.ref ?? "—"}
                    </span>
                    <Link
                      href={l.auction ? `/auctions/${l.auction.id}` : `/listings/${l.id}`}
                      className="font-semibold text-sm hover:text-primary-600 line-clamp-1"
                    >
                      {l.title}
                    </Link>
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {l.seller.name} · {l.city} ·{" "}
                    {LISTING_STATUS[l.status as keyof typeof LISTING_STATUS] ?? l.status} ·{" "}
                    <span suppressHydrationWarning>{timeAgo(l.createdAt)}</span>
                  </p>
                </div>
                <span className="font-bold text-sm tabular-nums shrink-0">
                  {l.price != null ? formatSAR(l.price) : l.auction ? formatSAR(l.auction.winningBid ?? l.auction.startPrice) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* users */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm flex items-center gap-2">
          <Users className="size-4 text-neutral-400" />
          المستخدمون
        </div>
        {users.length === 0 ? (
          <p className="p-6 text-sm text-neutral-400 text-center">لا يوجد مستخدمون مطابقون</p>
        ) : (
          <ul className="divide-y divide-neutral-50">
            {users.map((u) => (
              <li key={u.id} className="px-4 py-3 flex items-center gap-3">
                <Avatar name={u.name} color={u.avatarColor} src={u.avatarUrl} className="size-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    <Link href={`/profile/${u.id}`} className="hover:text-primary-600">{u.name}</Link>
                    {u.isPro && <span className="badge bg-neutral-900 text-primary-400 text-[10px]">PRO</span>}
                    {u.isBanned && <span className="badge bg-red-50 text-red-600 text-[10px]">محظور</span>}
                  </p>
                  <p className="text-xs text-neutral-400" dir="ltr">
                    {u.email}{u.phone ? ` · ${u.phone}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <CredibilityBadge score={u.credibility} compact />
                  <span className="chip">{ROLE_LABELS[u.role] ?? u.role}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
