"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RateForm({
  transactionId,
  targetName,
}: {
  transactionId: string;
  targetName: string;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) return;
    setState("sending");
    const res = await fetch(`/api/transactions/${transactionId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, comment }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "تعذّر إرسال التقييم");
      setState("error");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="badge bg-amber-50 text-amber-700 border border-amber-200 cursor-pointer hover:bg-amber-100"
      >
        <Star className="size-3.5" />
        قيّم {targetName}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2 mt-2">
      <div className="flex items-center gap-1" dir="ltr">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} نجوم`}
            className="cursor-pointer"
          >
            <Star
              className={cn(
                "size-6 transition-colors",
                n <= rating ? "text-amber-500 fill-current" : "text-neutral-300"
              )}
            />
          </button>
        ))}
      </div>
      <input
        className="input min-h-9 text-xs"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="تعليق مختصر (اختياري)..."
        maxLength={500}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button className="btn-primary min-h-9 text-xs" disabled={rating === 0 || state === "sending"}>
        {state === "sending" && <Loader2 className="size-3 animate-spin" />}
        إرسال التقييم
      </button>
    </form>
  );
}
