import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { CategoryIcon } from "@/components/CategoryIcon";

export const dynamic = "force-dynamic";

export const metadata = { title: "جميع الفئات" };

export default async function CategoriesPage() {
  const { lang, t } = await getT();
  const categories = await db.category.findMany({
    where: { parentId: null },
    orderBy: { sortOrder: "asc" },
    include: { children: { orderBy: { sortOrder: "asc" } } },
  });

  return (
    <div className="container-page py-8 pb-12 space-y-6">
      <h1 className="section-title">{t.categoryPage.allCategories}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat) => (
          <div key={cat.id} className="card p-5">
            <Link
              href={`/category/${cat.slug}`}
              className="flex items-center gap-3 group"
            >
              <CategoryIcon
                name={cat.icon}
                className="size-7 text-neutral-950 group-hover:text-primary-600 transition-colors shrink-0"
                strokeWidth={1.75}
              />
              <span className="font-bold text-neutral-900 group-hover:text-primary-600 transition-colors">
                {lang === "en" ? cat.nameEn : cat.nameAr}
              </span>
              <ChevronLeft className="size-4 text-neutral-300 ms-auto ltr:rotate-180" />
            </Link>
            {cat.children.length > 0 && (
              <ul className="mt-3 pt-3 border-t border-neutral-100 grid grid-cols-2 gap-1.5">
                {cat.children.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={`/category/${child.slug}`}
                      className="text-sm text-neutral-600 hover:text-primary-600 transition-colors"
                    >
                      {lang === "en" ? child.nameEn : child.nameAr}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
