"use client";

export function LanguageToggle({ lang }: { lang: "ar" | "en" }) {
  function toggle() {
    const next = lang === "ar" ? "en" : "ar";
    document.cookie = `samel_lang=${next}; path=/; max-age=31536000; samesite=lax`;
    location.reload();
  }

  return (
    <button
      onClick={toggle}
      className="text-sm font-bold text-neutral-400 hover:text-neutral-900 transition-colors cursor-pointer px-1.5 tracking-wide"
      aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
    >
      {lang === "ar" ? "EN" : "AR"}
    </button>
  );
}
