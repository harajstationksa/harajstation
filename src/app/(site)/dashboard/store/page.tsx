import { Store } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPlanLimits } from "@/lib/limits";
import { StoresManager } from "@/components/StoresManager";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.dash.storePage.title };
}

export default async function StorePage() {
  const user = await requireUser();
  const { t } = await getT();
  const d = t.dash.storePage;
  const [stores, limits] = await Promise.all([
    db.store.findMany({
      where: { userId: user.id },
      include: {
        verification: { select: { status: true, note: true } },
        _count: { select: { followers: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    getPlanLimits(user.isPro),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <Store className="size-6 text-primary-500" />
          {d.title}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          {d.sub}
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
          isVerified: s.isVerified,
          verifyStatus:
            (s.verification?.status as "PENDING" | "APPROVED" | "REJECTED" | undefined) ?? null,
          verifyNote: s.verification?.note ?? null,
          followers: s._count.followers,
          website: s.website,
          twitter: s.twitter,
          instagram: s.instagram,
          tiktok: s.tiktok,
          snapchat: s.snapchat,
          youtube: s.youtube,
          whatsapp: s.whatsapp,
        }))}
        maxStores={limits.maxStores}
      />
    </div>
  );
}
