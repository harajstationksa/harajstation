"use client";

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
  const { t } = useLang();

  async function toggle() {
    if (!loggedIn) {
      router.push("/login");
      return;
    }
    setFav((v) => !v); // optimistic
    const res = await fetch(`/api/favorites/${listingId}`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setFav(data.fav);
    } else {
      setFav((v) => !v);
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={fav ? "إزالة من المفضلة" : "أضف إلى المفضلة"}
      className={cn(
        "btn border",
        fav
          ? "bg-red-50 border-red-200 text-red-600"
          : "bg-white border-neutral-200 text-neutral-500 hover:text-red-600 hover:border-red-200"
      )}
    >
      <Heart className={cn("size-4.5", fav && "fill-current")} />
      {fav ? t.detail.inFavorites : t.detail.favorite}
    </button>
  );
}
