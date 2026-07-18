"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowRight, KeyRound, Loader2, MailCheck } from "lucide-react";
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
  // brute-force guard feedback: show the reset shortcut prominently
  const [suggestReset, setSuggestReset] = useState(false);
  // email-2FA second step: set when the password passed and a code was mailed
  const [otp, setOtp] = useState<{ challenge: string; email: string } | null>(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const { t } = useLang();
  const a = t.auth;

  // ticking countdown for the "resend code" button
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setUnverified("");
    setResent(false);
    setSuggestReset(false);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.requiresOtp) {
      setOtp({ challenge: data.challenge, email: data.email });
      setCode("");
      setCooldown(60);
      setLoading(false);
      return;
    }
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      if (data.needsVerification) setUnverified(data.email ?? identifier);
      if (data.suggestReset) setSuggestReset(true);
      setError(data.error ?? a.genericError);
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!otp) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge: otp.challenge, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    // expired / burned challenge → back to the password step
    if (data.restart) {
      setOtp(null);
      setCode("");
    }
    setError(data.error ?? a.genericError);
    setLoading(false);
  }

  async function resendCode() {
    if (!otp || cooldown > 0) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login/otp/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge: otp.challenge }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      if (data.restart) {
        setOtp(null);
        setCode("");
      }
      setError(data.error ?? a.genericError);
      return;
    }
    setCode("");
    setCooldown(60);
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
          {otp ? (
            <>
              <h1 className="font-display font-bold text-2xl">رمز التحقق</h1>
              <p className="text-sm text-neutral-500">
                أرسلنا رمزاً من 6 أرقام إلى <b dir="ltr">{otp.email}</b> — راجع بريدك
                (وصندوق الرسائل غير المرغوبة).
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display font-bold text-2xl">{a.loginTitle}</h1>
              <p className="text-sm text-neutral-500">{a.loginSub}</p>
            </>
          )}
        </div>

        {otp ? (
          <form onSubmit={verifyCode} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                <MailCheck className="size-4 text-primary-500" />
                رمز التحقق
              </label>
              <input
                className="input text-center !text-2xl tracking-[0.5em] font-bold"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••"
                autoFocus
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                {error}
              </p>
            )}

            <button className="btn-primary w-full" disabled={loading || code.length !== 6}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              تأكيد الدخول
            </button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={resendCode}
                disabled={loading || cooldown > 0}
                className="text-primary-600 font-semibold hover:underline disabled:text-neutral-400 disabled:no-underline"
              >
                {cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ثانية` : "إعادة إرسال الرمز"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtp(null);
                  setCode("");
                  setError("");
                }}
                className="text-neutral-500 hover:underline flex items-center gap-1"
              >
                <ArrowRight className="size-3.5" />
                رجوع
              </button>
            </div>
          </form>
        ) : (
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
                  unverified || suggestReset
                    ? "text-amber-800 bg-amber-50 border-amber-200"
                    : "text-red-600 bg-red-50 border-red-100"
                }`}
              >
                <p>{error}</p>

                {suggestReset && (
                  <Link
                    href="/forgot"
                    className="mt-2 inline-flex items-center gap-1.5 font-semibold underline underline-offset-2 hover:no-underline"
                  >
                    <KeyRound className="size-3.5" />
                    استعادة كلمة المرور
                  </Link>
                )}
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
        )}

        {!otp && (
          <>
            <SocialButtons />

            <div className="text-center text-sm text-neutral-500">
              {a.noAccount}{" "}
              <Link href="/register" className="text-primary-600 font-semibold hover:underline">
                {a.registerNow}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
