"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Hourglass,
  Loader2,
  MessageCircle,
  Paperclip,
  Phone,
  X,
} from "lucide-react";
import { formatSAR } from "@/lib/utils";
import { ChatButton } from "./ChatButton";
import { Countdown } from "./Countdown";

export type ConfirmTx = {
  id: string;
  role: "SELLER" | "BUYER";
  title: string;
  amount: number;
  deadline: string;
  status: string;
  myAnswer: string | null;
  otherAnswered: boolean;
  counterpart: { id: string; name: string; phone: string | null };
  listingId: string;
  evidenceSubmitted: boolean;
};

export function ConfirmCard({ tx }: { tx: ConfirmTx }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"YES" | "NO" | "EVIDENCE" | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function answer(value: "YES" | "NO") {
    const q = tx.role === "SELLER" ? "تأكيد التسليم" : "تأكيد الاستلام";
    if (!confirm(`${q}: هل أنت متأكد من إجابتك «${value === "YES" ? "نعم" : "لا"}»؟ لا يمكن التراجع.`)) return;
    setLoading(value);
    setError("");
    const res = await fetch(`/api/transactions/${tx.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: value }),
    });
    setLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "حدث خطأ");
      return;
    }
    router.refresh();
  }

  async function sendEvidence(e: React.FormEvent) {
    e.preventDefault();
    setLoading("EVIDENCE");
    setError("");
    const res = await fetch(`/api/transactions/${tx.id}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "حدث خطأ");
      return;
    }
    setNote("");
    router.refresh();
  }

  const question =
    tx.role === "SELLER"
      ? `هل قمت بتسليم المنتج إلى المشتري (${tx.counterpart.name})؟`
      : `هل استلمت المنتج من البائع (${tx.counterpart.name})؟`;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{tx.title}</p>
          <p className="text-sm text-neutral-500 mt-0.5">
            {tx.role === "SELLER" ? "أنت البائع" : "أنت المشتري"} · {formatSAR(tx.amount)}
          </p>
        </div>
        {tx.status === "DISPUTED" ? (
          <span className="badge bg-red-50 text-red-600 shrink-0">
            <AlertTriangle className="size-3.5" />
            متنازع عليها
          </span>
        ) : (
          <span className="badge bg-amber-50 text-amber-700 shrink-0">
            <Hourglass className="size-3.5" />
            بانتظار التأكيد
          </span>
        )}
      </div>

      {/* counterpart contact (revealed after transaction) */}
      <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-3 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm">
          <span className="text-neutral-500">
            {tx.role === "SELLER" ? "المشتري:" : "البائع:"}
          </span>{" "}
          <span className="font-semibold">{tx.counterpart.name}</span>
          {tx.counterpart.phone && (
            <span className="text-neutral-400 text-xs mr-2" dir="ltr">
              {tx.counterpart.phone}
            </span>
          )}
        </p>
        <div className="flex gap-2 items-center">
          {tx.counterpart.phone ? (
            <>
              <a
                href={`https://wa.me/${tx.counterpart.phone.replace("+", "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="badge bg-green-600 text-white hover:bg-green-700"
              >
                <MessageCircle className="size-3.5" />
                واتساب
              </a>
              <a href={`tel:${tx.counterpart.phone}`} className="badge bg-neutral-200 text-neutral-700">
                <Phone className="size-3.5" />
                اتصال
              </a>
            </>
          ) : (
            <span className="text-xs text-neutral-400">لم يضف رقم جوال — استخدم الشات</span>
          )}
          <ChatButton
            listingId={tx.listingId}
            buyerId={tx.role === "SELLER" ? tx.counterpart.id : undefined}
            label="شات"
            className="min-h-7 px-3 text-xs rounded-full"
          />
        </div>
      </div>

      {tx.status === "PENDING" && !tx.myAnswer && (
        <>
          <p className="font-semibold text-sm">{question}</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => answer("YES")}
              disabled={loading !== null}
              className="btn bg-green-600 text-white hover:bg-green-700"
            >
              {loading === "YES" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {tx.role === "SELLER" ? "نعم، تم التسليم" : "نعم، تم الاستلام"}
            </button>
            <button
              onClick={() => answer("NO")}
              disabled={loading !== null}
              className="btn-danger"
            >
              {loading === "NO" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
              {tx.role === "SELLER" ? "لا، لم يتم التسليم" : "لا، لم أستلم"}
            </button>
          </div>
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>المهلة المتبقية للرد:</span>
            <Countdown endsAt={tx.deadline} />
          </div>
        </>
      )}

      {tx.status === "PENDING" && tx.myAnswer && (
        <p className="text-sm text-neutral-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          سجّلنا إجابتك ({tx.myAnswer === "YES" ? "نعم" : "لا"}) — بانتظار رد الطرف الآخر
          قبل انتهاء المهلة.
        </p>
      )}

      {tx.status === "DISPUTED" && (
        <div className="space-y-3">
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            تعارضت الإجابتان حول هذه المعاملة. فريق الدعم سيراجع الحالة — أرفق ما
            يدعم موقفك (وصف ما حدث، تفاصيل الموعد، أي إثبات).
          </p>
          {tx.evidenceSubmitted && (
            <p className="text-xs text-green-700 flex items-center gap-1.5">
              <Check className="size-3.5" />
              تم استلام إفادتك — يمكنك إضافة المزيد
            </p>
          )}
          <form onSubmit={sendEvidence} className="space-y-2">
            <textarea
              className="input min-h-24 py-3"
              placeholder="اشرح ما حدث بالتفصيل..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              minLength={10}
              required
            />
            <button className="btn-secondary w-full" disabled={loading !== null}>
              {loading === "EVIDENCE" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Paperclip className="size-4" />
              )}
              إرسال الإفادة لفريق الدعم
            </button>
          </form>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
