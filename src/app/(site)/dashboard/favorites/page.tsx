import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { cardInclude } from "@/lib/types";
import { AuctionCard } from "@/components/AuctionCard";
import { EmptyState } from "@/components/EmptyState";
import { ListingCard } from "@/components/ListingCard";

export const dynamic = "force-dynamic";

export const metadata = { title: "المفضلة" };

export default async function FavoritesPage() {
  const user = await requireUser();

  const favorites = await db.favorite.findMany({
    where: { userId: user.id },
    include: { listing: { include: cardInclude } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <h1 className="section-title">المفضلة</h1>
      {favorites.length === 0 ? (
        <EmptyState
          title="قائمتك المفضلة فارغة"
          hint="اضغط على زر المفضلة في أي إعلان لحفظه هنا"
          action={<Link href="/listings" className="btn-secondary mt-2">تصفح الإعلانات</Link>}
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {favorites.map(({ listing }) =>
            listing.type === "AUCTION" ? (
              <AuctionCard key={listing.id} listing={listing} />
            ) : (
              <ListingCard key={listing.id} listing={listing} />
            )
          )}
        </div>
      )}
    </div>
  );
}
