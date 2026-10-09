import Link from "next/link";
import { ADMIN_PAGE_SIZE, type AdminParams } from "@/lib/admin";
export function AdminPagination({
  path,
  page,
  total,
  params = {},
}: {
  path: string;
  page: number;
  total: number;
  params?: AdminParams;
}) {
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const href = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (typeof v === "string" && v && k !== "page") q.set(k, v);
    if (n > 1) q.set("page", String(n));
    return `${path}${q.size ? `?${q}` : ""}`;
  };
  return (
    <nav aria-label="صفحات النتائج" className="admin-pagination">
      <p className="text-neutral-500">
        {total} سجل · صفحة {page} من {pages}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link className="btn-secondary" href={href(page - 1)}>
            السابق
          </Link>
        )}
        {page < pages && (
          <Link className="btn-secondary" href={href(page + 1)}>
            التالي
          </Link>
        )}
      </div>
    </nav>
  );
}
