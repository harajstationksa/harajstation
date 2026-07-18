import { getT } from "@/lib/i18n";
import Link from "next/link";
import { Suspense } from "react";
import { Compass, Gavel, LayoutGrid, Store } from "lucide-react";
import { db } from "@/lib/db";
import { CategoryIcon } from "@/components/CategoryIcon";
import { SearchBar } from "@/components/SearchBar";

/**
 * The 404 itself, with no page chrome — the two not-found routes wrap it
 * differently. See app/not-found.tsx for why.
 *
 * The most common way to land here is a listing that was sold or taken down, so
 * this is built to recover the visit rather than apologise: a search box and the
 * categories, not just a link home.
 */
export async function NotFoundBody() {
  const { t } = await getT();
  const categories = await db.category
    .findMany({
      where: { parentId: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, slug: true, nameAr: true, icon: true },
      take: 8,
    })
    .catch(() => []);

  const links = [
    { href: "/listings", icon: Compass, label: t.pub.nfBrowse },
    { href: "/auctions", icon: Gavel, label: t.pub.nfAuctions },
    { href: "/categories", icon: LayoutGrid, label: t.pub.nfCategories },
    { href: "/sell", icon: Store, label: t.pub.nfSell },
  ];

  return (
    <div className="container-page py-10 sm:py-20 pb-16">
      <div className="mx-auto max-w-2xl text-center">
        {/* the number, in the brand's orange — big enough to be the page */}
        <p
          className="font-extrabold leading-none tracking-tighter text-primary-500 select-none
                     text-[5.5rem] sm:text-[10rem]"
          aria-hidden
        >
          404
        </p>

        <h1 className="section-title mt-2">{t.pub.nfTitle}</h1>
        <p className="mt-3 text-sm sm:text-base text-neutral-500 leading-relaxed text-balance">
          {t.pub.nfBody}
        </p>

        <div className="mt-7">
          <Suspense fallback={<div className="h-11 rounded-xl bg-neutral-100 animate-pulse" />}>
            <SearchBar placeholder={t.nav.searchPh} />
          </Suspense>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {links.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white
                         px-3.5 py-2 text-xs sm:text-sm font-semibold text-neutral-600
                         hover:border-primary-400 hover:text-primary-600 transition-colors"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {categories.length > 0 && (
        <div className="mx-auto mt-10 sm:mt-12 max-w-3xl">
          <p className="mb-3 text-center text-xs font-semibold text-neutral-400">
            {t.pub.nfSections}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/category/${c.slug}`}
                className="group flex items-center gap-2.5 rounded-xl border border-neutral-200/80 bg-white
                           px-3.5 py-3 text-sm font-semibold text-neutral-700
                           hover:border-primary-400 hover:bg-primary-50/40 transition-colors"
              >
                <CategoryIcon
                  name={c.icon}
                  className="size-4 shrink-0 text-neutral-400 group-hover:text-primary-500 transition-colors"
                />
                <span className="truncate">{c.nameAr}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
