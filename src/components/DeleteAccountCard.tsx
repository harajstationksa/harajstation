"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

/** PDPL danger zone: permanent account deletion behind a password confirm. */
export function DeleteAccountCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "حدث خطأ — حاول مجدداً");
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="card p-5 border-red-100 space-y-3">
      <div className="flex items-center gap-2 text-red-600">
        <AlertTriangle className="size-5" />
        <h2 className="font-bold text-neutral-900">حذف الحساب نهائياً</h2>
      </div>
      <p className="text-sm text-neutral-500 leading-relaxed">
        حذف الحساب يمسح بياناتك الشخصية (الاسم، البريد، الجوال، الصور) بشكل نهائي،
        ويُخفي كل إعلاناتك، ويلغي حملاتك النشطة. <b>لا يمكن التراجع عن هذه الخطوة.</b>
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn bg-white border border-red-200 text-red-600 hover:bg-red-50"
        >
          <Trash2 className="size-4" />
          أريد حذف حسابي
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3 max-w-sm">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              أكّد كلمة المرور لإتمام الحذف
            </label>
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
          <div className="flex items-center gap-2">
            <button
              className="btn bg-red-600 text-white hover:bg-red-700"
              disabled={loading || !password}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              حذف نهائي
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-secondary"
            >
              تراجع
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
