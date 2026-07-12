"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import { CITIES } from "@/lib/constants";
import { useLang } from "@/components/LangProvider";
import { SocialButtons } from "@/components/SocialButtons";

export function RegisterForm({ freeTierDays }: { freeTierDays: number | null }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    city: "الرياض",
    password: "",
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useLang();
  const a = t.auth;

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, acceptTerms }),
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
          <h1 className="font-display font-bold text-2xl">{a.registerTitle}</h1>
          <p className="text-sm text-neutral-500">{a.registerSub}</p>
        </div>

        {/* launch promo — shown only while the admin free-tier switch is on */}
        {freeTierDays && (
          <p className="flex items-center gap-2.5 text-sm font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded-xl px-3.5 py-3">
            <Gift className="size-5 shrink-0 text-primary-500" />
            {a.freeTierBanner(freeTierDays)}
          </p>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">{a.fullName}</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
              minLength={2}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{a.email}</label>
            <input
              className="input"
              dir="ltr"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{a.city}</label>
            <select
              className="input"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{a.password}</label>
            <input
              className="input"
              dir="ltr"
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              required
              minLength={8}
            />
            <p className="text-xs text-neutral-400 mt-1">{a.passwordHint}</p>
          </div>

          <label className="flex items-start gap-2.5 text-sm text-neutral-600 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              required
              className="size-4 accent-primary-500 mt-0.5 shrink-0"
            />
            <span>
              {a.termsAgree}{" "}
              <Link href="/terms" target="_blank" className="text-primary-600 font-semibold hover:underline">
                {a.termsLink}
              </Link>{" "}
              {a.termsRest}
            </span>
          </label>

          <p className="text-xs text-neutral-400 bg-neutral-50 rounded-lg p-2.5">
            {a.phoneNote}
          </p>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button className="btn-primary w-full" disabled={loading || !acceptTerms}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {a.createBtn}
          </button>
        </form>

        <SocialButtons />

        <div className="text-center text-sm text-neutral-500">
          {a.haveAccount}{" "}
          <Link href="/login" className="text-primary-600 font-semibold hover:underline">
            {a.loginLink}
          </Link>
        </div>
      </div>
    </div>
  );
}
