"use client";
import "../admin/admin.css";

import { clientFetch } from "@/lib/client-fetch";
async function resilientFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    return await clientFetch(input, {
      ...init,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return new Response(JSON.stringify({ error: "تعذّر الاتصال. حاول مجددًا" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

import { AdminPasswordRecovery } from "@/components/AdminPasswordRecovery";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, KeyRound, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";

type Step = "email" | "password" | "code";

/**
 * Admin-portal login. Three steps at most:
 *   email → (password, only for accounts that enabled one) → emailed 6-digit
 * code. The code step is mandatory for everyone — there is no way into the
 * portal without access to the staff member's inbox.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  async function submitLogin(withPassword: boolean) {
    setBusy(true);
    setError("");
    setInfo("");
    const res = await resilientFetch("/api/admin-auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withPassword ? { email, password } : { email }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "تعذّر تسجيل الدخول");
      return;
    }
    if (data.needPassword) {
      setStep("password");
      return;
    }
    if (data.requiresOtp) {
      setChallenge(data.challenge);
      setMaskedEmail(data.email);
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 50);
    }
  }

  async function submitCode() {
    setBusy(true);
    setError("");
    const res = await resilientFetch("/api/admin-auth/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "تعذّر التحقق من الرمز");
      if (data.restart) restart();
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  async function resend() {
    setBusy(true);
    setError("");
    setInfo("");
    const res = await resilientFetch("/api/admin-auth/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "تعذّر إعادة الإرسال");
      if (data.restart) restart();
      return;
    }
    setInfo("أرسلنا رمزاً جديداً إلى بريدك");
  }

  function restart() {
    setStep("email");
    setPassword("");
    setCode("");
    setChallenge("");
  }

  return (
    <div className="admin-login min-h-dvh flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="حراج ستيشن" className="h-14 mx-auto mb-3 object-contain" />
          <h1 className="font-display font-extrabold text-2xl text-neutral-800">بوابة الإدارة</h1>
          <p className="text-sm text-neutral-500 mt-1 flex items-center justify-center gap-1.5">
            <ShieldCheck className="size-4 text-primary-500" />
            دخول آمن لفريق الإدارة
          </p>
        </div>

        <div className="admin-login-card p-6 sm:p-8 space-y-5">
          {step === "email" && (
            <p className="text-sm text-neutral-500">أدخل بريد حسابك الإداري لمتابعة الدخول.</p>
          )}
          {step === "email" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.includes("@")) submitLogin(false);
              }}
            >
              <div>
                <label
                  htmlFor="admin-login-email"
                  className="block text-sm font-medium text-neutral-600 mb-1.5"
                >
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <Mail className="size-4 text-neutral-500 absolute top-1/2 -translate-y-1/2 end-3" />
                  <input
                    dir="ltr"
                    type="email"
                    id="admin-login-email"
                    autoComplete="email"
                    autoFocus
                    className="input bg-neutral-50 border-neutral-200 text-neutral-800 w-full pe-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <button className="btn-primary w-full" disabled={busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowLeft className="size-4" />
                )}
                متابعة
              </button>
            </form>
          )}

          {step === "password" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (password) submitLogin(true);
              }}
            >
              <p className="text-sm text-neutral-500" dir="ltr">
                {email}
              </p>
              <div>
                <label
                  htmlFor="admin-login-password"
                  className="block text-sm font-medium text-neutral-600 mb-1.5"
                >
                  كلمة المرور
                </label>
                <div className="relative">
                  <Lock className="size-4 text-neutral-500 absolute top-1/2 -translate-y-1/2 end-3" />
                  <input
                    dir="ltr"
                    type="password"
                    id="admin-login-password"
                    autoComplete="current-password"
                    autoFocus
                    className="input bg-neutral-50 border-neutral-200 text-neutral-800 w-full pe-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
              <button className="btn-primary w-full" disabled={busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowLeft className="size-4" />
                )}
                متابعة
              </button>
              <button
                type="button"
                onClick={restart}
                className="text-xs text-neutral-500 hover:text-neutral-900 w-full text-center"
              >
                تغيير البريد
              </button>
            </form>
          )}

          {step === "code" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (/^\d{6}$/.test(code)) submitCode();
              }}
            >
              <div className="text-center space-y-1">
                <KeyRound className="size-8 text-primary-500 mx-auto" />
                <p className="text-sm text-neutral-600">أرسلنا رمز دخول من 6 أرقام إلى</p>
                <p className="text-sm font-semibold text-neutral-800" dir="ltr">
                  {maskedEmail}
                </p>
              </div>
              <input
                ref={codeRef}
                aria-label="رمز الدخول من ستة أرقام"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="input bg-neutral-50 border-neutral-200 text-neutral-800 w-full text-center text-2xl font-bold tracking-[0.5em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
              />
              <button className="btn-primary w-full" disabled={busy || code.length !== 6}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                دخول
              </button>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={resend}
                  disabled={busy}
                  className="text-primary-600 hover:text-primary-700"
                >
                  إعادة إرسال الرمز
                </button>
                <button
                  type="button"
                  onClick={restart}
                  className="text-neutral-500 hover:text-neutral-900"
                >
                  رجوع
                </button>
              </div>
            </form>
          )}

          {(step === "email" || step === "password") && <AdminPasswordRecovery email={email} />}
          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2"
            >
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              {error}
            </p>
          )}
          {info && !error && (
            <p
              role="status"
              className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-center"
            >
              {info}
            </p>
          )}
        </div>

        <p className="text-center text-[11px] text-neutral-600 mt-6">
          هذه البوابة مخصصة لفريق عمل حراج ستيشن فقط — كل محاولات الدخول مسجلة
        </p>
      </div>
    </div>
  );
}
