import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { getT } from "@/lib/i18n";

export async function SectionHeader({
  title,
  subtitle,
  href,
  badge,
  accent = true,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  badge?: ReactNode;
  /** show the orange accent bar next to the title (category sections turn it off) */
  accent?: boolean;
}) {
  const { t } = await getT();
  return (
    <div className="flex items-end justify-between mb-5">
      <div className="flex items-center gap-3">
        {accent && <span className="w-1 h-7 rounded-full bg-primary-500 shrink-0" />}
        <div>
          <h2 className="section-title flex items-center gap-2">
            {title}
            {badge}
          </h2>
          {subtitle && <p className="text-xs text-neutral-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {href && (
        <Link
          href={href}
          className="text-sm font-semibold text-neutral-500 hover:text-primary-600 flex items-center gap-0.5 transition-colors shrink-0"
        >
          {t.home.viewAll}
          <ChevronLeft className="size-4 rtl:rotate-0 ltr:rotate-180" />
        </Link>
      )}
    </div>
  );
}
