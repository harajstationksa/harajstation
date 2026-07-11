"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Gavel, LayoutGrid, Search, Store, Tag } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Suggestion = {
  type: "listing" | "auction" | "category" | "store";
  label: string;
  href: string;
};

const TYPE_ICON = {
  listing: Tag,
  auction: Gavel,
  category: LayoutGrid,
  store: Store,
};

export function SearchBar({
  className,
  placeholder = "ابحث عن سيارات، عقارات، جوالات...",
}: {
  className?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function onChange(value: string) {
    setQ(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(value.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.suggestions);
        setOpen(data.suggestions.length > 0);
      } catch {
        /* ignore */
      }
    }, 250);
  }

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div className={className} ref={boxRef}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q.trim() ? `/listings?q=${encodeURIComponent(q.trim())}` : "/listings");
        }}
      >
        <div className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4.5 text-neutral-400 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder={placeholder}
            className="input-pill pr-10"
            aria-label="بحث"
          />

          {open && (
            <div className="absolute top-full mt-1.5 inset-x-0 card p-1.5 z-50 shadow-lg animate-fade-up">
              {suggestions.map((s, i) => {
                const Icon = TYPE_ICON[s.type];
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => go(s.href)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-right text-neutral-700 hover:bg-primary-50 hover:text-primary-700 transition-colors cursor-pointer"
                  >
                    <Icon className="size-4 text-neutral-400 shrink-0" />
                    <span className="line-clamp-1">{s.label}</span>
                    {s.type === "auction" && (
                      <span className="badge bg-red-50 text-red-600 mr-auto text-[10px]">مزاد</span>
                    )}
                    {s.type === "category" && (
                      <span className="badge bg-neutral-100 text-neutral-500 mr-auto text-[10px]">فئة</span>
                    )}
                    {s.type === "store" && (
                      <span className="badge bg-primary-50 text-primary-600 mr-auto text-[10px]">متجر</span>
                    )}
                  </button>
                );
              })}
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-primary-600 hover:bg-primary-50 transition-colors cursor-pointer border-t border-neutral-50 mt-1"
              >
                <Search className="size-4 shrink-0" />
                بحث عن «{q}» في كل الإعلانات
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
