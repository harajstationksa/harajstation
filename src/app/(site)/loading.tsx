"use client";

import { useLang } from "@/components/LangProvider";

// Keep the shared header and mobile navigation interactive while page data
// streams. The root fallback is above this layout and cannot do that.
export default function SiteLoading() {
  const { lang } = useLang();
  return (
    <div className="container-page py-8 space-y-6" role="status" aria-busy="true" data-site-loading>
      <span className="sr-only">{lang === "ar" ? "جارٍ تحميل الصفحة" : "Loading page"}</span>
      <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
        <div className="h-8 w-40 rounded-lg bg-neutral-200" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-56 rounded-xl bg-neutral-100 border border-neutral-200/60"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
