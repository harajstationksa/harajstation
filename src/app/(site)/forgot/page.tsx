"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { useLang } from "@/components/LangProvider";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useLang();
  const f = t.forgot;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? t.auth.genericError);
      return;
    }
    setDone(true);
    setResetUrl(data.resetUrl ?? null);
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 px-4">
      <div className="card w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <span className="size-12 rounded-2xl bg-primary-500 text-white inline-flex items-center justify-center">
            <KeyRound className="size-6" />
          </span>
          <h1 className="font-display font-bold text-2xl">{f.title}</h1>
          <p className="text-sm text-neutral-500">{f.sub}</p>
        </div>

        {done ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5">
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
              {f.sent}
            </p>
            {resetUrl && (
              <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-3 text-xs text-neutral-500 space-y-2">
                <p className="font-semibold text-neutral-600">{f.demoNote}</p>
                <Link href={resetUrl} className="btn-primary w-full">
                  {f.resetNow}
                </Link>
              </div>
            )}
            <p className="text-center text-sm text-neutral-500">
              <Link href="/login" className="text-primary-600 font-semibold hover:underline">
                {f.backToLogin}
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{f.email}</label>
              <input
                className="input"
                dir="ltr"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button className="btn-primary w-full" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {f.sendBtn}
            </button>

            <p className="text-center text-sm text-neutral-500">
              {f.remembered}{" "}
              <Link href="/login" className="text-primary-600 font-semibold hover:underline">
                {f.loginLink}
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
