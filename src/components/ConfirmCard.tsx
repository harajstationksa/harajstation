"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Hourglass,
  Loader2,
  MessageCircle,
  Paperclip,
  Phone,
  X,
} from "lucide-react";
import { useLang } from "@/components/LangProvider";
import { EXTENSION_DAY_OPTIONS } from "@/lib/constants";
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
  /** null = the buyer never asked for more time */
  extStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
  extDays: number | null;
  extNote: string | null;
};

export function ConfirmCard({ tx }: { tx: ConfirmTx }) {
  const { t } = useLang();
  const d = t.dash.confirmCard;
  const router = useRouter();
  const [loading, setLoading] = useState<
    "YES" | "NO" | "EVIDENCE" | "EXT" | null
  >(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [extOpen, setExtOpen] = useState(false);
  const [extDays, setExtDays] = useState(EXTENSION_DAY_OPTIONS[0]);
  const [extNote, setExtNote] = useState("");

  async function answer(value: "YES" | "NO") {
    const q = tx.role === "SELLER" ? d.confirmDeliver : d.confirmReceive;
    if (!confirm(d.confirmQ(q, value === "YES" ? d.yes : d.no))) return;
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
      setError(data.error ?? d.err);
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
      setError(data.error ?? d.err);
      return;
    }
    setNote("");
    router.refresh();
  }

  /** buyer asks for more time, or seller answers that ask */
  async function extension(
    body: { days: number; note?: string } | { decision: "APPROVE" | "REJECT" }
  ) {
    setLoading("EXT");
    setError("");
    const res = await fetch(`/api/transactions/${tx.id}/extension`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? d.err);
      return;
    }
    setExtOpen(false);
    setExtNote("");
    router.refresh();
  }

  const question =
    tx.role === "SELLER" ? d.qSeller(tx.counterpart.name) : d.qBuyer(tx.counterpart.name);
  const isBuyer = tx.role === "BUYER";
  // one extension per transaction, and only while the buyer still owes an answer
  const canAskExtension =
    isBuyer && tx.status === "PENDING" && !tx.myAnswer && !tx.extStatus;
  const extDaysValue = tx.extDays ?? 0;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{tx.title}</p>
          <p className="text-sm text-neutral-500 mt-0.5">
            {tx.role === "SELLER" ? d.youSeller : d.youBuyer} · {formatSAR(tx.amount)}
          </p>
        </div>
        {tx.status === "DISPUTED" ? (
          <span className="badge bg-red-50 text-red-600 shrink-0">
            <AlertTriangle className="size-3.5" />
            {d.disputed}
          </span>
        ) : (
          <span className="badge bg-amber-50 text-amber-700 shrink-0">
            <Hourglass className="size-3.5" />
            {d.awaiting}
          </span>
        )}
      </div>

      {/* counterpart contact (revealed after transaction) */}
      <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-3 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm">
          <span className="text-neutral-500">
            {tx.role === "SELLER" ? d.buyerLabel : d.sellerLabel}
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
                {d.whatsapp}
              </a>
              <a href={`tel:${tx.counterpart.phone}`} className="badge bg-neutral-200 text-neutral-700">
                <Phone className="size-3.5" />
                {d.call}
              </a>
            </>
          ) : (
            <span className="text-xs text-neutral-400">{d.noPhone}</span>
          )}
          <ChatButton
            listingId={tx.listingId}
            buyerId={tx.role === "SELLER" ? tx.counterpart.id : undefined}
            label={d.chat}
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
              {tx.role === "SELLER" ? d.yesDelivered : d.yesReceived}
            </button>
            <button
              onClick={() => answer("NO")}
              disabled={loading !== null}
              className="btn-danger"
            >
              {loading === "NO" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
              {tx.role === "SELLER" ? d.noDelivered : d.noReceived}
            </button>
          </div>
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>{d.deadline}</span>
            <Countdown endsAt={tx.deadline} />
          </div>
        </>
      )}

      {tx.status === "PENDING" && tx.myAnswer && (
        <p className="text-sm text-neutral-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          {d.answered(tx.myAnswer === "YES" ? d.yes : d.no)}
        </p>
      )}

      {/* ── deadline extension: buyer asks, seller decides ── */}
      {tx.status === "PENDING" && (
        <>
          {canAskExtension && !extOpen && (
            <button
              onClick={() => setExtOpen(true)}
              className="act-btn bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            >
              <CalendarClock className="size-3.5" />
              {d.extAsk}
            </button>
          )}

          {canAskExtension && extOpen && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-2.5">
              <p className="text-xs text-neutral-500">{d.extHint}</p>
              <label className="block text-sm font-semibold">{d.extDays}</label>
              <select
                className="input"
                value={extDays}
                onChange={(e) => setExtDays(Number(e.target.value))}
              >
                {EXTENSION_DAY_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {d.extDaysOpt(n)}
                  </option>
                ))}
              </select>
              <textarea
                className="input min-h-20 py-2"
                placeholder={d.extNotePh}
                value={extNote}
                onChange={(e) => setExtNote(e.target.value)}
                maxLength={300}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    extension({ days: extDays, note: extNote.trim() || undefined })
                  }
                  disabled={loading !== null}
                  className="btn-primary"
                >
                  {loading === "EXT" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CalendarClock className="size-4" />
                  )}
                  {d.extSend}
                </button>
                <button
                  onClick={() => setExtOpen(false)}
                  disabled={loading !== null}
                  className="btn-secondary"
                >
                  {d.extCancel}
                </button>
              </div>
            </div>
          )}

          {tx.extStatus === "PENDING" && isBuyer && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {d.extPendingBuyer(extDaysValue)}
            </p>
          )}

          {tx.extStatus === "PENDING" && !isBuyer && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2.5">
              <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
                <CalendarClock className="size-4" />
                {d.extPendingSeller(extDaysValue)}
              </p>
              {tx.extNote && (
                <p className="text-sm text-neutral-600">
                  <span className="text-neutral-500">{d.extNoteLabel}</span>{" "}
                  {tx.extNote}
                </p>
              )}
              <p className="text-xs text-neutral-500">{d.extAutoNote}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    if (!confirm(d.extApproveQ(extDaysValue))) return;
                    extension({ decision: "APPROVE" });
                  }}
                  disabled={loading !== null}
                  className="btn bg-green-600 text-white hover:bg-green-700"
                >
                  {loading === "EXT" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  {d.extApprove}
                </button>
                <button
                  onClick={() => {
                    if (!confirm(d.extRejectQ)) return;
                    extension({ decision: "REJECT" });
                  }}
                  disabled={loading !== null}
                  className="btn-danger"
                >
                  <X className="size-4" />
                  {d.extReject}
                </button>
              </div>
            </div>
          )}

          {tx.extStatus === "APPROVED" && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
              {isBuyer
                ? d.extApprovedBuyer(extDaysValue)
                : d.extApprovedSeller(extDaysValue)}
            </p>
          )}

          {tx.extStatus === "REJECTED" && (
            <p className="text-sm text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
              {isBuyer ? d.extRejectedBuyer : d.extRejectedSeller}
            </p>
          )}
        </>
      )}

      {tx.status === "DISPUTED" && (
        <div className="space-y-3">
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {d.disputeBody}
          </p>
          {tx.evidenceSubmitted && (
            <p className="text-xs text-green-700 flex items-center gap-1.5">
              <Check className="size-3.5" />
              {d.evidenceOk}
            </p>
          )}
          <form onSubmit={sendEvidence} className="space-y-2">
            <textarea
              className="input min-h-24 py-3"
              placeholder={d.evidencePh}
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
              {d.evidenceBtn}
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
