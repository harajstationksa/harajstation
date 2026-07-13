import Link from "next/link";
import { Suspense } from "react";
import { Bell, Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getNavCategories } from "@/lib/categories";
import { STAFF_ROLES } from "@/lib/constants";
import { getLang, STR } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";
import { SearchBar } from "./SearchBar";
import { UserMenu } from "./UserMenu";

export async function Header() {
  const [user, categories, lang] = await Promise.all([
    getCurrentUser(),
    getNavCategories(),
    getLang(),
  ]);
  const t = STR[lang];
  const unread = user
    ? await db.notification.count({ where: { userId: user.id, readAt: null } })
    : 0;

  return (
    // solid bg — backdrop-filter here would trap the fixed mobile account sheet.
    // white reaches the viewport top; breathing room lives INSIDE via padding.
    // Only sticky from md up: on a phone the header (logo + search + category
    // rail) is tall enough that pinning it to the top eats the screen.
    <header className="relative md:sticky md:top-0 z-40 bg-white border-b border-neutral-200/80">
      {/* row 1 — logo alone, above the search bar (bg flush to top) */}
      <div className="container-page flex pt-4 sm:pt-5">
        <Link href="/" className="flex items-center shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="حراج ستيشن"
            className="h-16 sm:h-20 w-auto object-contain"
          />
        </Link>
      </div>

      {/* row 2 — search · actions (pushed down below the logo) */}
      <div className="container-page flex items-center gap-3 sm:gap-6 pt-2 sm:pt-3 pb-3 sm:pb-4">
        <Suspense>
          <SearchBar className="flex-1 hidden md:block" placeholder={t.searchPh} />
        </Suspense>

        <div className="flex items-center gap-1.5 sm:gap-2.5 mr-auto shrink-0">
          <LanguageToggle lang={lang} />

          {/* Post-ad CTA — dark rectangle with accent plus (logical padding = mirrors in LTR) */}
          <Link
            href="/sell"
            className="hidden sm:flex items-center gap-2.5 rounded-lg bg-neutral-900 text-white ps-2 pe-5 py-2 text-sm font-semibold hover:bg-neutral-800 active:scale-[0.98] transition-all"
          >
            <span className="size-6.5 rounded-md bg-primary-500 flex items-center justify-center shrink-0">
              <Plus className="size-4" />
            </span>
            {t.postAd}
          </Link>

          {user ? (
            <>
              <Link
                href="/dashboard/notifications"
                className="relative size-9 rounded-full border border-neutral-200 hover:bg-neutral-50 transition-colors flex items-center justify-center"
                aria-label="الإشعارات"
              >
                <Bell className="size-4.5 text-neutral-500" />
                {unread > 0 && (
                  <span className="absolute -top-1 -left-1 size-4.5 rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <UserMenu
                name={user.name}
                color={user.avatarColor}
                avatarUrl={user.avatarUrl}
                isPro={user.isPro}
                isStaff={STAFF_ROLES.includes(user.role)}
                points={user.points}
              />
            </>
          ) : (
            <span className="flex items-center gap-3 text-sm">
              <Link
                href="/login"
                className="font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                {t.login}
              </Link>
              <span className="h-4 w-px bg-neutral-200" />
              <Link
                href="/register"
                className="font-bold text-primary-600 hover:text-primary-700 transition-colors"
              >
                {t.signup}
              </Link>
            </span>
          )}
        </div>
      </div>

      {/* row 2 mobile — search */}
      <div className="container-page pb-3 md:hidden">
        <Suspense>
          <SearchBar placeholder={t.searchPh} />
        </Suspense>
      </div>

      {/* row 2 desktop — categories bar */}
      <nav className="border-t border-neutral-100 hidden md:block">
        <div className="container-page flex items-center gap-1 h-11 overflow-x-auto no-scrollbar text-[13px] font-medium text-neutral-600">
          <Link
            href="/auctions"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-neutral-100 transition-colors shrink-0 font-semibold text-neutral-900"
          >
            <span className="size-1.5 rounded-full bg-red-500 animate-live-pulse" />
            {t.auctions}
          </Link>
          <span className="h-4 w-px bg-neutral-200 mx-1 shrink-0" />
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/category/${cat.slug}`}
              className="px-3 py-1.5 rounded-full hover:bg-neutral-100 hover:text-neutral-900 transition-colors shrink-0"
            >
              {lang === "en" ? cat.nameEn : cat.nameAr}
            </Link>
          ))}
          <Link
            href="/categories"
            className="px-3 py-1.5 rounded-full text-primary-600 hover:bg-primary-50 transition-colors shrink-0 font-semibold"
          >
            {t.all}
          </Link>
        </div>
      </nav>
    </header>
  );
}
