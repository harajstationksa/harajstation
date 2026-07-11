import Link from "next/link";
import { BellRing, Gavel, MapPin, Search, Tag } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";
import { DeleteSavedSearch } from "@/components/DeleteSavedSearch";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export const metadata = { title: "تنبيهات البحث" };

export default async function SavedSearchesPage() {
  const user = await requireUser();
  const searches = await db.savedSearch.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const catSlugs = [...new Set(searches.map((s) => s.category).filter(Boolean))];
  const cats = catSlugs.length
    ? await db.category.findMany({ where: { slug: { in: catSlugs } } })
    : [];
  const catName = new Map(cats.map((c) => [c.slug, c.nameAr]));

  return (
    <div className="space-y-6">
      {/* ── header ── */}
      <div className="card p-5 flex items-center gap-4 bg-gradient-to-l from-white to-primary-50/60">
        <span className="size-12 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0">
          <BellRing className="size-6" />
        </span>
        <div>
          <h1 className="section-title">تنبيهات البحث المحفوظ</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            احفظ بحثاً («كامري 2020 الرياض») ويصلك إشعار فور نزول إعلان مطابق.
          </p>
        </div>
      </div>

      {searches.length === 0 ? (
        <EmptyState
          title="لا توجد تنبيهات بحث محفوظة"
          hint="ابحث عمّا يهمك ثم اضغط «نبّهني عند نزول إعلان مشابه»"
          action={<Link href="/listings" className="btn-primary mt-2">ابدأ البحث</Link>}
        />
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-neutral-50">
            {searches.map((s) => {
              const parts = [
                s.query && { icon: Search, label: `«${s.query}»` },
                s.category && { icon: Tag, label: catName.get(s.category) ?? s.category },
                s.city && { icon: MapPin, label: s.city },
                s.type === "AUCTION" && { icon: Gavel, label: "مزادات فقط" },
              ].filter(Boolean) as { icon: typeof Search; label: string }[];

              const qs = new URLSearchParams();
              if (s.query) qs.set("q", s.query);
              if (s.category) qs.set("category", s.category);
              if (s.city) qs.set("city", s.city);
              const browseHref =
                s.type === "AUCTION"
                  ? `/auctions${qs.size ? `?${qs}` : ""}`
                  : `/listings${qs.size ? `?${qs}` : ""}`;

              return (
                <li key={s.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <Link href={browseHref} className="min-w-0 flex-1 group">
                    <p className="text-sm font-semibold flex items-center gap-2 flex-wrap group-hover:text-primary-600 transition-colors">
                      {parts.map(({ icon: Icon, label }) => (
                        <span key={label} className="inline-flex items-center gap-1">
                          <Icon className="size-3.5 text-neutral-400" />
                          {label}
                        </span>
                      ))}
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5" suppressHydrationWarning>
                      حُفظ {timeAgo(s.createdAt)}
                      {s.hits > 0 && (
                        <>
                          {" · "}
                          <span className="text-green-600 font-semibold">
                            {s.hits.toLocaleString("en-US")} إعلان مطابق
                          </span>
                          {s.lastHitAt && ` · آخر تطابق ${timeAgo(s.lastHitAt)}`}
                        </>
                      )}
                    </p>
                  </Link>
                  <DeleteSavedSearch id={s.id} />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-xs text-neutral-400">
        فعّل إشعارات المتصفح من صفحة الإشعارات ليصلك التنبيه حتى والموقع مغلق.
      </p>
    </div>
  );
}
