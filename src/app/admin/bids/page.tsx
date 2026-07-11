import Link from "next/link";
import { Gavel } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { formatSAR, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "سجل المزايدات" };

export default async function AdminBidsPage() {
  await requireStaff(["ADMIN", "MODERATOR"]);

  const bids = await db.bid.findMany({
    include: {
      bidder: true,
      auction: { include: { listing: { include: { seller: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <Gavel className="size-6 text-red-600" />
          سجل المزايدات الكامل
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          الهويات الحقيقية للمزايدين تظهر هنا فقط ضمن صلاحيات الإدارة — لمراجعة
          أي نشاط مشبوه أو تلاعب بالأسعار
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-175">
          <thead>
            <tr className="border-b border-neutral-100 text-right text-xs text-neutral-500">
              <th className="p-3 font-semibold">المزايد (الحقيقي)</th>
              <th className="p-3 font-semibold">الاسم المقنّع</th>
              <th className="p-3 font-semibold">المزاد</th>
              <th className="p-3 font-semibold">البائع</th>
              <th className="p-3 font-semibold">المبلغ</th>
              <th className="p-3 font-semibold">التوقيت</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {bids.map((b) => (
              <tr key={b.id} className="hover:bg-neutral-50/60">
                <td className="p-3">
                  <Link href={`/profile/${b.bidderId}`} className="font-semibold hover:text-primary-600">
                    {b.bidder.name}
                  </Link>
                  <p className="text-xs text-neutral-400">{b.bidder.email}</p>
                </td>
                <td className="p-3 text-xs text-neutral-500">{b.maskedName}</td>
                <td className="p-3">
                  <Link href={`/auctions/${b.auctionId}`} className="text-xs text-primary-600 hover:underline line-clamp-1 max-w-52">
                    {b.auction.listing.title}
                  </Link>
                </td>
                <td className="p-3 text-xs text-neutral-500">{b.auction.listing.seller.name}</td>
                <td className="p-3 font-bold tabular-nums text-xs">{formatSAR(b.amount)}</td>
                <td className="p-3 text-xs text-neutral-400" suppressHydrationWarning>
                  {timeAgo(b.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
