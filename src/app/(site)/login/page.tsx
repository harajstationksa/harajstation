"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useLang } from "@/components/LangProvider";
import { SocialButtons } from "@/components/SocialButtons";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useLang();
  const a = t.auth;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? a.genericError);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 px-4">
      <div className="card w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="حراج ستيشن" className="h-20 w-auto inline-block" />
          <h1 className="font-display font-bold text-2xl">{a.loginTitle}</h1>
          <p className="text-sm text-neutral-500">{a.loginSub}</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">{a.identifier}</label>
            <input
              className="input"
              dir="ltr"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium">{a.password}</label>
              <Link href="/forgot" className="text-xs text-primary-600 font-semibold hover:underline">
                {a.forgot}
              </Link>
            </div>
            <input
              className="input"
              dir="ltr"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {a.loginBtn}
          </button>
        </form>

        <SocialButtons />

        <div className="text-center text-sm text-neutral-500">
          {a.noAccount}{" "}
          <Link href="/register" className="text-primary-600 font-semibold hover:underline">
            {a.registerNow}
          </Link>
        </div>

      </div>
    </div>
  );
}
