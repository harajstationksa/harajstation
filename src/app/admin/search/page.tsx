import { AdminPageHeader } from "@/components/AdminPageHeader";
import { pageQuery, text, type AdminParams } from "@/lib/admin";
import { AdminPagination } from "@/components/AdminPagination";
import { publicAsset, publicUrl } from "@/lib/admin";
import Link from "next/link";
import { Hash, ListChecks, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { normalizeArabic } from "@/lib/arabic";
import { LISTING_STATUS, ROLE_LABELS } from "@/lib/constants";
import { formatSAR, parseImages, timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { CredibilityBadge } from "@/components/CredibilityBadge";
import { hasStaffPermission } from "@/lib/staff-permissions";

export const dynamic = "force-dynamic";

export const metadata = { title: "بحث الإدارة" };

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<AdminParams>;
}) {
  const me = await requireStaff(["ADMIN", "MODERATOR", "SUPPORT"], "search.view");
  const canListings = hasStaffPermission(me, "listings.view");
  const canUsers = hasStaffPermission(me, "users.view");
  const sp = await searchParams;
  const query = text(sp.q);
  const { page, take, skip } = pageQuery(sp);

  if (!query) {
    return (
      <div className="space-y-4">
        <AdminPageHeader
          section="search"
          description={<>ابحث من شريط البحث أعلى اللوحة في الأقسام التي سُمح لك بعرضها.</>}
        >
          بحث الإدارة
        </AdminPageHeader>
      </div>
    );
  }

  const norm = normalizeArabic(query);
  const refQuery = query.toUpperCase().startsWith("SM-")
    ? query.toUpperCase()
    : /^\d{4,}$/.test(query)
      ? `SM-${query}`
      : null;

  const listingWhere = {
    OR: [
      ...(refQuery ? [{ ref: refQuery }] : []),
      { ref: query.toUpperCase() },
      { id: query },
      { title: { contains: query } },
      { searchText: { contains: norm } },
    ],
  };
  const userWhere = {
    OR: [
      { name: { contains: query } },
      { email: { contains: query.toLowerCase() } },
      { phone: { contains: query.replace(/^0/, "") } },
      { id: query },
    ],
  };
  const [listingCount, userCount] = await Promise.all([
    canListings ? db.listing.count({ where: listingWhere }) : Promise.resolve(0),
    canUsers ? db.user.count({ where: userWhere }) : Promise.resolve(0),
  ]);
  const [listings, users] = await Promise.all([
    canListings
      ? db.listing.findMany({
          where: listingWhere,
          include: { seller: true, auction: true },
          orderBy: { createdAt: "desc" },
          take,
          skip,
        })
      : Promise.resolve([]),
    canUsers
      ? db.user.findMany({
          where: userWhere,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take,
          skip,
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        section="search"
        description={
          <>
            {listingCount} إعلان · {userCount} مستخدم
          </>
        }
      >
        نتائج البحث عن «{query}»
      </AdminPageHeader>
      <AdminPagination
        path="/admin/search"
        page={page}
        total={Math.max(listingCount, userCount)}
        params={sp}
      />

      {/* listings */}
      {canListings && (
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
                  <img
                    src={publicAsset(parseImages(l.images)[0])}
                    alt=""
                    className="size-12 rounded-lg object-cover border border-neutral-100 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge bg-neutral-900 text-white font-mono text-[10px]">
                        <Hash className="size-3" />
                        {l.ref ?? "—"}
                      </span>
                      <Link
                        href={
                          l.status === "REMOVED"
                            ? `/admin/listings/${l.id}`
                            : publicUrl(
                                l.auction ? `/auctions/${l.auction.id}` : `/listings/${l.id}`,
                              )
                        }
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
                    {l.price != null
                      ? formatSAR(l.price)
                      : l.auction
                        ? formatSAR(l.auction.winningBid ?? l.auction.startPrice)
                        : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* users */}
      {canUsers && (
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
                  <Avatar
                    name={u.name}
                    color={u.avatarColor}
                    src={u.avatarUrl ? publicAsset(u.avatarUrl) : undefined}
                    className="size-10 text-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm flex items-center gap-1.5">
                      <Link href={publicUrl(`/profile/${u.id}`)} className="hover:text-primary-600">
                        {u.name}
                      </Link>
                      {u.isPro && (
                        <span className="badge bg-neutral-900 text-primary-400 text-[10px]">
                          PRO
                        </span>
                      )}
                      {u.isBanned && (
                        <span className="badge bg-red-50 text-red-600 text-[10px]">محظور</span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-400" dir="ltr">
                      {u.email}
                      {u.phone ? ` · ${u.phone}` : ""}
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
      )}
    </div>
  );
}
