"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "./LangProvider";

export function ChatButton({
  listingId,
  buyerId,
  label,
  className,
}: {
  listingId: string;
  buyerId?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { t } = useLang();
  const text = label ?? t.detail.chatSeller;

  async function start() {
    setLoading(true);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, buyerId }),
    });
    setLoading(false);
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      router.push(`/dashboard/messages/${data.id}`);
    }
  }

  return (
    <button onClick={start} disabled={loading} className={cn("btn-secondary", className)}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />}
      {text}
    </button>
  );
}
