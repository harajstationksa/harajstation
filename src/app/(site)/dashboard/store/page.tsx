import { Store } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPlanLimits } from "@/lib/limits";
import { StoresManager } from "@/components/StoresManager";

export const dynamic = "force-dynamic";

export const metadata = { title: "متاجري" };

export default async function StorePage() {
  const user = await requireUser();
  const [stores, limits] = await Promise.all([
    db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    getPlanLimits(user.isPro),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <Store className="size-6 text-primary-500" />
          متاجري
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          كل متجر يجمع إعلاناتك تحت هوية ورابط خاص. عدد المتاجر يعتمد على خطتك.
        </p>
      </div>

      <StoresManager
        stores={stores.map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          description: s.description,
          logoUrl: s.logoUrl,
          bannerUrl: s.bannerUrl,
        }))}
        maxStores={limits.maxStores}
      />
    </div>
  );
}
