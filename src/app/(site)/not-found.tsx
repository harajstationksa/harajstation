import { NotFoundBody } from "@/components/NotFoundBody";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "الصفحة غير موجودة",
  robots: { index: false, follow: true },
};

/**
 * A sold or deleted listing, a bad category slug — anything inside the site that
 * calls notFound(). The header, footer and bottom nav already come from this
 * group's layout, so only the body belongs here.
 */
export default function SiteNotFound() {
  return <NotFoundBody />;
}
