"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BellRing, Loader2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * متابعة بائع/متجر — followers get a notification (in-app + push) for every
 * new listing or auction the seller publishes.
 */
export function FollowButton({
  sellerId,
  initialFollowing,
  followerCount,
  className,
}: {
  sellerId: string;
  initialFollowing: boolean;
  followerCount?: number;
  className?: string;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(followerCount);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const res = await fetch(`/api/follow/${sellerId}`, {
      method: following ? "DELETE" : "POST",
    });
    setLoading(false);
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) return;
    setFollowing(!following);
    if (count != null) setCount(count + (following ? -1 : 1));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className={cn(
        following
          ? "btn-secondary !border-green-200 !bg-green-50 !text-green-700"
          : "btn-primary",
        className
      )}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : following ? (
        <BellRing className="size-4" />
      ) : (
        <UserPlus className="size-4" />
      )}
      {following ? "تتابعه — يصلك كل جديد" : "تابع البائع"}
      {count != null && count > 0 && (
        <span className="text-xs opacity-70 tabular-nums">({count.toLocaleString("en-US")})</span>
      )}
    </button>
  );
}
