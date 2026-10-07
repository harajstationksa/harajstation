"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

/** Global admin search — ref (SM-xxxxx), listing title, user name/email/phone. */
export function AdminSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <form
      className="admin-header-search relative flex-1 max-w-md xl:ms-4 min-w-0"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/admin/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500 pointer-events-none" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="بحث بالإعلان أو الاسم أو البريد…"
        className="w-full rounded-xl bg-neutral-50 border border-neutral-200 ps-9 pe-3 min-h-11 text-sm text-neutral-900 placeholder:text-neutral-500 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition"
        aria-label="بحث الإدارة"
      />
    </form>
  );
}
