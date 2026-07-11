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
      className="relative flex-1 max-w-md max-sm:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/admin/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500 pointer-events-none" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ابحث برقم الإعلان (SM-100001) أو الاسم أو البريد..."
        className="w-full rounded-lg bg-neutral-800 border border-neutral-700 ps-9 pe-3 min-h-9 text-sm text-white placeholder:text-neutral-500 outline-none focus:border-neutral-500 transition"
        aria-label="بحث الإدارة"
      />
    </form>
  );
}
