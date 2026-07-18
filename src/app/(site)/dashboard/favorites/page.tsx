import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { cardInclude } from "@/lib/types";
import { AuctionCard } from "@/components/AuctionCard";
import { EmptyState } from "@/components/EmptyState";
import { ListingCard } from "@/components/ListingCard";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.dash.favorites.title };
}

export default async function FavoritesPage() {
  const user = await requireUser();
  const { t } = await getT();
  const d = t.dash.favorites;

  const favorites = await db.favorite.findMany({
    where: { userId: user.id },
    include: { listing: { include: cardInclude } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <h1 className="section-title">{d.title}</h1>
      {favorites.length === 0 ? (
        <EmptyState
          title={d.emptyTitle}
          hint={d.emptyHint}
          action={<Link href="/listings" className="btn-secondary mt-2">{d.browse}</Link>}
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
