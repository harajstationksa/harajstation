"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLang } from "@/components/LangProvider";
import { SocialButtons } from "@/components/SocialButtons";

// the Google routes bounce failures back here as ?error=…
const SOCIAL_ERRORS: Record<string, string> = {
  google: "تعذّر تسجيل الدخول عبر Google — حاول مرة أخرى",
  google_unverified: "بريد حساب Google غير مؤكد لدى Google نفسها",
  banned: "هذا الحساب محظور.",
};

export default function LoginPage() {
  // useSearchParams needs a boundary above it
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const socialError = SOCIAL_ERRORS[useSearchParams().get("error") ?? ""] ?? "";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(socialError);
  const [loading, setLoading] = useState(false);
  // set when the password was right but the address is still unconfirmed
  const [unverified, setUnverified] = useState("");
  const [resent, setResent] = useState(false);
  const { t } = useLang();
  const a = t.auth;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setUnverified("");
    setResent(false);
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
      if (data.needsVerification) setUnverified(data.email ?? identifier);
      setError(data.error ?? a.genericError);
      setLoading(false);
    }
  }

  async function resend() {
    setLoading(true);
    await fetch("/api/auth/verify-email/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: unverified }),
    });
    setResent(true);
    setLoading(false);
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
            <div
              className={`text-sm rounded-lg px-3 py-2.5 border ${
                unverified
                  ? "text-amber-800 bg-amber-50 border-amber-200"
                  : "text-red-600 bg-red-50 border-red-100"
              }`}
            >
              <p>{error}</p>

              {unverified && !resent && (
                <button
                  type="button"
                  onClick={resend}
                  disabled={loading}
                  className="mt-2 font-semibold underline underline-offset-2 hover:no-underline"
                >
                  إعادة إرسال رابط التفعيل
                </button>
              )}
              {resent && (
                <p className="mt-2 font-semibold">
                  أرسلنا رابطاً جديداً إلى {unverified} — راجع بريدك وصندوق الرسائل غير المرغوبة.
                </p>
              )}
            </div>
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
