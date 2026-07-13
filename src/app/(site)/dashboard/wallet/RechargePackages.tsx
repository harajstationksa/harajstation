"use client";

import { useState } from "react";
import { BadgePercent, CheckCircle2, Gift, Loader2, XCircle } from "lucide-react";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { buyPointsAction } from "./actions";

type Pkg = { id: string; points: number; bonus: number; price: number };

/**
 * Recharge package grid with a shared promo-code field: the code is checked
 * live via /api/promo/validate and travels with whichever package form the
 * user submits (final validation happens server-side again).
 */
export function RechargePackages({
  packages,
  promoError,
}: {
  packages: Pkg[];
  promoError?: string;
}) {
  const [promo, setPromo] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<
    | { state: "idle" }
    | { state: "valid"; percent: number }
    | { state: "invalid"; error: string }
  >(promoError ? { state: "invalid", error: promoError } : { state: "idle" });

  const applied = result.state === "valid" ? result.percent : 0;

  async function checkPromo() {
    const code = promo.trim();
    if (!code) return;
    setChecking(true);
    try {
      const res = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.valid) {
        setResult({ state: "valid", percent: data.percent });
      } else {
        setResult({ state: "invalid", error: data.error ?? "كود غير صحيح" });
      }
    } catch {
      setResult({ state: "invalid", error: "تعذر التحقق — حاول مرة أخرى" });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* promo code */}
      <div className="card p-4">
        <label className="text-sm font-semibold flex items-center gap-1.5 mb-2">
          <BadgePercent className="size-4 text-primary-500" />
          عندك كود خصم؟
        </label>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            dir="ltr"
            placeholder="PROMO2026"
            value={promo}
            onChange={(e) => {
              setPromo(e.target.value.toUpperCase());
              setResult({ state: "idle" });
            }}
            maxLength={30}
          />
          <button
            type="button"
            onClick={checkPromo}
            disabled={checking || !promo.trim()}
            className="btn-secondary shrink-0"
          >
            {checking && <Loader2 className="size-4 animate-spin" />}
            تحقق
          </button>
        </div>
        {result.state === "valid" && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mt-2 flex items-center gap-1.5">
            <CheckCircle2 className="size-4 shrink-0" />
            كود صحيح — ستحصل على {result.percent}% نقاط إضافية على أي باقة تشحنها
          </p>
        )}
        {result.state === "invalid" && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-2 flex items-center gap-1.5">
            <XCircle className="size-4 shrink-0" />
            {result.error}
          </p>
        )}
      </div>

      {/* packages */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {packages.map((pkg) => {
          const promoPts = Math.floor(((pkg.points + pkg.bonus) * applied) / 100);
          return (
            <form key={pkg.id} action={buyPointsAction} className="card p-4 text-center space-y-2">
              <input type="hidden" name="packageId" value={pkg.id} />
              {/* the typed code always travels along — the server re-validates */}
              {promo.trim() !== "" && <input type="hidden" name="promo" value={promo.trim()} />}
              <p className="font-display font-extrabold text-2xl text-neutral-900">
                {pkg.points.toLocaleString("en-US")}
              </p>
              <p className="text-xs text-neutral-500">نقطة</p>
              {pkg.bonus > 0 && (
                <span className="badge bg-green-50 text-green-700 mx-auto">
                  <Gift className="size-3" />
                  +{pkg.bonus} هدية
                </span>
              )}
              {promoPts > 0 && (
                <span className="badge bg-primary-50 text-primary-700 mx-auto">
                  <BadgePercent className="size-3" />
                  +{promoPts} كود خصم
                </span>
              )}
              <ConfirmSubmit
                confirm={`شراء ${pkg.points} نقطة بمبلغ ${(pkg.price * 1.15).toFixed(2)} ر.س (شامل الضريبة)؟ سيتم تحويلك لصفحة الدفع الآمنة.`}
                className="btn-primary w-full mt-1"
              >
                {pkg.price} ر.س
              </ConfirmSubmit>
            </form>
          );
        })}
      </div>
    </div>
  );
}
