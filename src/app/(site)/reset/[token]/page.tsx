"use client";

import Link from "next/link";
import { use, useState } from "react";
import { CheckCircle2, Loader2, LockKeyhole } from "lucide-react";
import { useLang } from "@/components/LangProvider";

export default function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const { t } = useLang();
  const f = t.forgot;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(f.mismatch);
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? t.auth.genericError);
      return;
    }
    setDone(true);
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 px-4">
      <div className="card w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <span className="size-12 rounded-2xl bg-primary-500 text-white inline-flex items-center justify-center">
            <LockKeyhole className="size-6" />
          </span>
          <h1 className="font-display font-bold text-2xl">{f.resetTitle}</h1>
        </div>

        {done ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5">
              <CheckCircle2 className="size-4 shrink-0" />
              {f.resetDone}
            </p>
            <Link href="/login" className="btn-primary w-full">
              {f.loginWithNew}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{f.newPassword}</label>
              <input
                className="input"
                dir="ltr"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <p className="text-xs text-neutral-400 mt-1">{f.passwordHint}</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{f.confirmPassword}</label>
              <input
                className="input"
                dir="ltr"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
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
              {f.saveBtn}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
