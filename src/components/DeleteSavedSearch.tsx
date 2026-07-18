"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useLang } from "@/components/LangProvider";

export function DeleteSavedSearch({ id }: { id: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function remove() {
    if (!confirm(t.dash.savedSearch.delConfirm)) return;
    setLoading(true);
    await fetch(`/api/saved-searches/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={loading}
      className="act-btn text-neutral-400 hover:text-red-600 hover:bg-red-50"
      aria-label={t.dash.savedSearch.delLabel}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );
}
