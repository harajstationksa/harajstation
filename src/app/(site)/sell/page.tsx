import { getT } from "@/lib/i18n";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPlanLimits } from "@/lib/limits";
import { SellForm } from "@/components/SellForm";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.dash.postAd };
}

export default async function SellPage() {
  const user = await getCurrentUser();
  const { t } = await getT();

  if (!user) {
    return (
      <div className="container-page py-20 text-center space-y-4">
        <PlusCircle className="size-12 text-primary-400 mx-auto" />
        <h1 className="section-title">{t.pub.sellLoginTitle}</h1>
        <p className="text-neutral-500">{t.pub.sellLoginSub}</p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/login" className="btn-primary">{t.pub.login}</Link>
          <Link href="/register" className="btn-secondary">{t.pub.register}</Link>
        </div>
      </div>
    );
  }

  const [categories, activeListings, activeAuctions, limits, stores] = await Promise.all([
    db.category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: "asc" },
      include: { children: { orderBy: { sortOrder: "asc" } } },
    }),
    db.listing.count({
      // announcements draw from the same quota as sale posts
      where: { sellerId: user.id, status: "ACTIVE", type: { not: "AUCTION" } },
    }),
    db.listing.count({
      where: { sellerId: user.id, status: "ACTIVE", type: "AUCTION" },
    }),
    getPlanLimits(user.isPro),
    db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
  ]);

  const { maxListings, maxAuctions } = limits;

  return (
    <div className="container-page py-8 pb-12 max-w-3xl">
      <h1 className="section-title mb-1">{t.pub.sellTitle}</h1>
      <p className="text-sm text-neutral-500 mb-6">
        {t.pub.sellQuota(
          t.pub.sellActive(activeListings, user.isPro ? t.pub.sellUnlimited : t.pub.sellOf(maxListings)),
          t.pub.sellAuctions(activeAuctions, maxAuctions)
        )}
      </p>
      <SellForm
        categories={categories.map((c) => ({
          id: c.id,
          slug: c.slug,
          nameAr: c.nameAr,
          nameEn: c.nameEn,
          children: c.children.map((ch) => ({ id: ch.id, nameAr: ch.nameAr, nameEn: ch.nameEn })),
        }))}
        stores={stores.map((s) => ({ id: s.id, name: s.name }))}
        canListing={activeListings < maxListings}
        canAuction={activeAuctions < maxAuctions}
      />
    </div>
  );
}
