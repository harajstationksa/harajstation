"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Ban,
  BellRing,
  Crown,
  Loader2,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  adjustCredibilityAction,
  adjustUserPointsAction,
  grantProAction,
  notifyUserAction,
  toggleBanAction,
} from "@/app/admin/actions";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isPro: boolean;
  proUntil: string | null; // ISO
  isBanned: boolean;
  avatarColor: string;
  avatarUrl: string | null;
};

const PRO_PRESETS = [7, 30, 90, 365];

/**
 * Per-user management modal on /admin/users: PRO membership (grant for any
 * duration / permanent / revoke), private notification, credibility & points
 * adjustments, and ban — all in one place instead of a crowded actions cell.
 */
export function AdminUserActions({
  user,
  canBan,
  canAdjust,
  canPro,
}: {
  user: AdminUser;
  canBan: boolean;
  canAdjust: boolean;
  canPro: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState("");
  const [customDays, setCustomDays] = useState("");

  function run(action: (fd: FormData) => Promise<void>, fd: FormData, doneMsg: string) {
    setDone("");
    startTransition(async () => {
      await action(fd);
      setDone(doneMsg);
      router.refresh();
    });
  }

  const fd = (entries: Record<string, string>) => {
    const f = new FormData();
    f.set("userId", user.id);
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  };

  const proLabel = user.isPro
    ? user.proUntil
      ? `نشط حتى ${new Date(user.proUntil).toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" })}`
      : "نشط — دائم"
    : "غير مشترك";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDone("");
          setOpen(true);
        }}
        className="badge bg-neutral-900 text-white hover:bg-neutral-700 cursor-pointer"
      >
        <Settings2 className="size-3.5" />
        إدارة
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[88vh] overflow-y-auto">
            {/* header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-neutral-100 px-5 py-3.5 flex items-center gap-3 z-10">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="size-9 rounded-full object-cover" />
              ) : (
                <span
                  className="size-9 rounded-full text-white text-sm font-bold flex items-center justify-center"
                  style={{ backgroundColor: user.avatarColor }}
                >
                  {user.name.charAt(0)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm line-clamp-1">{user.name}</p>
                <p className="text-xs text-neutral-400 line-clamp-1" dir="ltr">
                  {user.email}
                </p>
              </div>
              {pending && <Loader2 className="size-4 animate-spin text-primary-500" />}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {done && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                  {done} ✓
                </p>
              )}

              {/* ── PRO membership ── */}
              {canPro && (
                <section className="space-y-2.5">
                  <h3 className="font-bold text-sm flex items-center gap-1.5">
                    <Crown className="size-4 text-amber-500" />
                    اشتراك برو
                    <span
                      className={`badge text-[10px] ${
                        user.isPro ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {proLabel}
                    </span>
                  </h3>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PRO_PRESETS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        disabled={pending || (user.isPro && !user.proUntil)}
                        onClick={() =>
                          run(grantProAction, fd({ mode: "days", days: String(d) }), `تم منح ${d} يوم برو`)
                        }
                        className="badge bg-neutral-100 text-neutral-700 hover:bg-amber-100 hover:text-amber-800 cursor-pointer disabled:opacity-40"
                      >
                        +{d} يوم
                      </button>
                    ))}
                    <div className="flex items-center gap-1">
                      <input
                        value={customDays}
                        onChange={(e) => setCustomDays(e.target.value.replace(/\D/g, ""))}
                        placeholder="أيام"
                        dir="ltr"
                        className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-xs text-center"
                      />
                      <button
                        type="button"
                        disabled={pending || !customDays || (user.isPro && !user.proUntil)}
                        onClick={() =>
                          run(grantProAction, fd({ mode: "days", days: customDays }), `تم منح ${customDays} يوم برو`)
                        }
                        className="badge bg-amber-500 text-white hover:bg-amber-600 cursor-pointer disabled:opacity-40"
                      >
                        منح
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={pending || (user.isPro && !user.proUntil)}
                      onClick={() => run(grantProAction, fd({ mode: "permanent" }), "تم منح برو دائم")}
                      className="badge bg-neutral-900 text-amber-400 hover:bg-neutral-700 cursor-pointer disabled:opacity-40"
                    >
                      <Crown className="size-3.5" />
                      دائم
                    </button>
                    {user.isPro && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(grantProAction, fd({ mode: "revoke" }), "تم إلغاء الاشتراك")}
                        className="badge bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer"
                      >
                        إلغاء الاشتراك
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    المدد تُضاف فوق الاشتراك الحالي إن وُجد — والمنح الدائم لا ينتهي إلا بالإلغاء.
                  </p>
                </section>
              )}

              {/* ── private notification ── */}
              <section className="space-y-2.5 border-t border-neutral-100 pt-4">
                <h3 className="font-bold text-sm flex items-center gap-1.5">
                  <BellRing className="size-4 text-primary-500" />
                  إشعار / رسالة خاصة
                </h3>
                <form
                  action={(f) => {
                    f.set("userId", user.id);
                    run(notifyUserAction, f, "أُرسل الإشعار — داخل الموقع وعبر الجوال");
                  }}
                  className="space-y-2"
                >
                  <input
                    name="title"
                    required
                    minLength={3}
                    maxLength={100}
                    placeholder="عنوان الرسالة"
                    className="input !text-sm"
                  />
                  <textarea
                    name="body"
                    required
                    minLength={5}
                    maxLength={500}
                    placeholder="نص الرسالة — يصل للمستخدم كإشعار داخل الموقع وإشعار Push على جهازه"
                    className="input !text-sm min-h-20 py-2.5"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      name="link"
                      placeholder="رابط اختياري (/pro أو https://…)"
                      dir="ltr"
                      className="input !text-sm flex-1"
                    />
                    <button disabled={pending} className="btn-primary !min-h-9 !px-4 text-xs shrink-0">
                      <Send className="size-3.5" />
                      إرسال
                    </button>
                  </div>
                </form>
              </section>

              {/* ── credibility & points ── */}
              {canAdjust && user.role === "USER" && (
                <section className="space-y-2.5 border-t border-neutral-100 pt-4">
                  <h3 className="font-bold text-sm flex items-center gap-1.5">
                    <SlidersHorizontal className="size-4 text-neutral-500" />
                    تعديلات الرصيد
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <form
                      action={(f) => {
                        f.set("userId", user.id);
                        f.set("reason", "تعديل إداري");
                        run(adjustCredibilityAction, f, "عُدّلت المصداقية");
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        name="delta"
                        placeholder="±مصداقية"
                        dir="ltr"
                        className="input !text-xs !py-1.5 flex-1 text-center"
                      />
                      <button disabled={pending} className="badge bg-neutral-800 text-white cursor-pointer hover:bg-neutral-700 shrink-0">
                        <ShieldCheck className="size-3.5" />
                        تطبيق
                      </button>
                    </form>
                    <form
                      action={(f) => {
                        f.set("userId", user.id);
                        run(adjustUserPointsAction, f, "عُدّلت النقاط");
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        name="delta"
                        placeholder="±نقاط"
                        dir="ltr"
                        className="input !text-xs !py-1.5 flex-1 text-center"
                      />
                      <button disabled={pending} className="badge bg-amber-500 text-white cursor-pointer hover:bg-amber-600 shrink-0">
                        تطبيق
                      </button>
                    </form>
                  </div>
                </section>
              )}

              {/* ── ban ── */}
              {canBan && user.role !== "ADMIN" && (
                <section className="border-t border-neutral-100 pt-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm flex items-center gap-1.5">
                      <Ban className="size-4 text-red-500" />
                      {user.isBanned ? "رفع الحظر" : "حظر الحساب"}
                    </h3>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      {user.isBanned
                        ? "يعيد للمستخدم الدخول والنشر"
                        : "يمنع الدخول ويُخفي إعلاناته ومتاجره"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (!user.isBanned && !window.confirm(`حظر ${user.name}؟`)) return;
                      run(toggleBanAction, fd({}), user.isBanned ? "رُفع الحظر" : "تم الحظر");
                    }}
                    className={`badge cursor-pointer shrink-0 ${
                      user.isBanned
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : "bg-red-600 text-white hover:bg-red-700"
                    }`}
                  >
                    {user.isBanned ? "رفع الحظر" : "حظر"}
                  </button>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
