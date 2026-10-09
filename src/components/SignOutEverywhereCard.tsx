"use client";

import { clientFetch } from "@/lib/client-fetch";
import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { useLang } from "@/components/LangProvider";

/** Ends every session of the account (bumps its session version server-side). */
export function SignOutEverywhereCard() {
  const { t } = useLang();
  const d = t.dash.settings;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signOutEverywhere() {
    setLoading(true);
    setError("");
    const res = await clientFetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ everywhere: true }),
    });
    if (!res.ok) {
      setError(d.genericError);
      setLoading(false);
      return;
    }
    window.location.href = "/login";
  }

  return (
    <section className="card p-5 space-y-3">
      <h2 className="font-bold flex items-center gap-2">
        <LogOut className="size-5 text-neutral-500" />
        {d.signOutAllTitle}
      </h2>
      <p className="text-sm text-neutral-500 leading-relaxed">{d.signOutAllDesc}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        className="btn-secondary inline-flex items-center gap-2"
        onClick={signOutEverywhere}
        disabled={loading}
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        {d.signOutAllBtn}
      </button>
    </section>
  );
}
