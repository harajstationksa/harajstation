"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BellPlus, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * «نبّهني عند نزول إعلان مشابه» — saves the current search (query + filters)
 * so the user gets a notification whenever a new matching listing lands.
 */
export function SaveSearchButton({
  query = "",
  category = "",
  city = "",
  type = "",
  className,
}: {
  query?: string;
  category?: string;
  city?: string;
  type?: string;
  className?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "saved">("idle");
  const [error, setError] = useState("");

  async function save() {
    setState("loading");
    setError("");
    const res = await fetch("/api/saved-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, category, city, type }),
    });
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "حدث خطأ");
      setState("idle");
      return;
    }
    setState("saved");
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={save}
        disabled={state !== "idle"}
        className={cn(
          "act-btn border",
          state === "saved"
            ? "bg-green-50 text-green-700 border-green-200 cursor-default"
            : "bg-white text-neutral-600 border-neutral-200 hover:border-primary-400 hover:text-primary-600",
          className
        )}
      >
        {state === "loading" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : state === "saved" ? (
          <Check className="size-3.5" />
        ) : (
          <BellPlus className="size-3.5" />
        )}
        {state === "saved" ? "سنبلغك فور نزول إعلان مطابق" : "نبّهني عند نزول إعلان مشابه"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
