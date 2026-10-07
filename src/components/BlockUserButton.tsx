"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clientFetch } from "@/lib/client-fetch";
import { useLang } from "./LangProvider";

export function BlockUserButton({
  userId,
  initiallyBlocked,
}: {
  userId: string;
  initiallyBlocked: boolean;
}) {
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { lang } = useLang();
  const router = useRouter();
  async function change() {
    setBusy(true);
    setError("");
    try {
      const res = await clientFetch("/api/account/blocks", {
        method: blocked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error();
      setBlocked(!blocked);
      router.refresh();
    } catch {
      setError(lang === "en" ? "Please try again." : "تعذّر الحفظ، حاول مجددًا.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="text-xs">
      <button
        type="button"
        disabled={busy}
        onClick={change}
        className="text-red-600 disabled:opacity-50"
      >
        {lang === "en"
          ? blocked
            ? "Unblock"
            : "Block user"
          : blocked
            ? "إلغاء الحظر"
            : "حظر المستخدم"}
      </button>
      {error && (
        <span role="alert" className="block text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
