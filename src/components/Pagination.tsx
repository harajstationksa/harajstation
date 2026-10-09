import Link from "next/link";

export function Pagination({
  page,
  total,
  size,
  path,
  params = {},
  lang = "ar",
}: {
  page: number;
  total: number;
  size: number;
  path: string;
  params?: Record<string, string>;
  lang?: string;
}) {
  const pages = Math.ceil(total / size);
  if (pages < 2) return null;
  const href = (n: number) => `${path}?${new URLSearchParams({ ...params, page: String(n) })}`;
  return (
    <nav
      aria-label={lang === "en" ? "Pagination" : "الصفحات"}
      className="flex flex-wrap items-center justify-center gap-3 py-4"
    >
      {page > 1 && (
        <Link className="btn-secondary" href={href(page - 1)}>
          {lang === "en" ? "Previous" : "السابق"}
        </Link>
      )}
      <span className="text-sm text-neutral-500" dir="ltr">
        {page} / {pages} · {total}
      </span>
      {page < pages && (
        <Link className="btn-secondary" href={href(page + 1)}>
          {lang === "en" ? "Next" : "التالي"}
        </Link>
      )}
    </nav>
  );
}
