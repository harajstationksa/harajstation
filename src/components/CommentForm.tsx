"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { useLang } from "./LangProvider";

export function CommentForm({
  listingId,
  loggedIn,
}: {
  listingId: string;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useLang();

  if (!loggedIn) {
    return (
      <p className="text-sm text-neutral-500">
        <Link href="/login" className="text-primary-600 font-semibold hover:underline">
          {t.comments.loginLink}
        </Link>{" "}
        {t.comments.loginPrompt}
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch(`/api/listings/${listingId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "تعذّر إرسال التعليق");
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <input
          className="input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t.comments.placeholder}
          minLength={2}
          maxLength={1000}
          required
        />
        <button className="btn-primary px-4 shrink-0" disabled={loading || !body.trim()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 -scale-x-100" />}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-[11px] text-neutral-400">{t.comments.note}</p>
    </form>
  );
}
