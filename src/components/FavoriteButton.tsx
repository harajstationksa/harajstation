"use client";

import { clientFetch } from "@/lib/client-fetch";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "./LangProvider";

export function FavoriteButton({
  listingId,
  initialFav,
  loggedIn,
}: {
  listingId: string;
  initialFav: boolean;
  loggedIn: boolean;
}) {
  const [fav, setFav] = useState(initialFav);
  const router = useRouter();
  const { t, lang } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    if (!loggedIn) {
      router.push("/login");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    setFav((v) => !v); // optimistic
    const res = await clientFetch(`/api/favorites/${listingId}`, {
      method: "POST",
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setFav(data.fav);
    } else {
      setFav((v) => !v);
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? (lang === "en" ? "Please try again" : "حاول مجددًا"));
    }
  }

  return (
    <div>
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={fav}
        aria-label={fav ? t.detail.inFavorites : t.detail.favorite}
        className={cn(
          "btn border",
          fav
            ? "bg-red-50 border-red-200 text-red-600"
            : "bg-white border-neutral-200 text-neutral-500 hover:text-red-600 hover:border-red-200",
        )}
      >
        <Heart className={cn("size-4.5", fav && "fill-current")} />
        {fav ? t.detail.inFavorites : t.detail.favorite}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
