"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Crown,
  Gavel,
  Loader2,
  X,
  Zap,
} from "lucide-react";
import { cn, formatSAR, timeAgo } from "@/lib/utils";
import { Countdown } from "./Countdown";
import { useLang } from "./LangProvider";

type BidRow = {
  id: string;
  amount: number;
  name: string;
  at: string;
  mine: boolean;
};

export type AuctionState = {
  status: string;
  endsAt: string;
  currentBid: number;
  minNext: number;
  minIncrement: number;
  bidCount: number;
  buyNowPrice: number | null;
  isTopBidder: boolean;
  isSeller: boolean;
  myProxyMax: number | null;
  winnerMasked: string | null;
  bids: BidRow[];
};

const POLL_MS = 3000;

export function BidPanel({
  auctionId,
  initial,
  loggedIn,
}: {
  auctionId: string;
  initial: AuctionState;
  loggedIn: boolean;
}) {
  const [state, setState] = useState(initial);
  const [amount, setAmount] = useState<string>(String(initial.minNext));
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [proxyMax, setProxyMax] = useState("");
  const [proxyBusy, setProxyBusy] = useState(false);
  const amountTouched = useRef(false);
  const { lang, t } = useLang();
  const b = t.bid;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/auctions/${auctionId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: AuctionState = await res.json();
      setState(data);
      if (!amountTouched.current) setAmount(String(data.minNext));
    } catch {
      /* offline — keep last state */
    }
  }, [auctionId]);

  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function placeBid(value: number) {
    setSubmitting(true);
    setError("");
    setFlash("");
    const res = await fetch(`/api/auctions/${auctionId}/bids`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: value }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? b.failed);
      refresh();
      return;
    }
    amountTouched.current = false;
    setFlash(data.buyNow ? b.boughtNow : data.extended ? b.extended : b.accepted);
    refresh();
  }

  async function setProxy() {
    const v = parseInt(proxyMax, 10);
    if (!Number.isFinite(v)) return;
    setProxyBusy(true);
    setError("");
    setFlash("");
    const res = await fetch(`/api/auctions/${auctionId}/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxAmount: v }),
    });
    const data = await res.json().catch(() => ({}));
    setProxyBusy(false);
    if (!res.ok) {
      setError(data.error ?? b.failed);
      refresh();
      return;
    }
    setProxyMax("");
    setFlash(data.youAreTop ? b.proxyDoneTop : b.proxyDoneOutbid);
    refresh();
  }

  async function cancelProxy() {
    if (!confirm(b.proxyCancelConfirm)) return;
    setProxyBusy(true);
    await fetch(`/api/auctions/${auctionId}/proxy`, { method: "DELETE" });
    setProxyBusy(false);
    refresh();
  }

  const live = state.status === "LIVE" && new Date(state.endsAt) > new Date();
  const quick = [1, 2, 5].map((n) => state.currentBid + state.minIncrement * n);

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-4">
        {/* status row */}
        <div className="flex items-center justify-between">
          {live ? (
            <span className="badge bg-red-600 text-white">
              <span className="size-1.5 rounded-full bg-white animate-live-pulse" />
              {b.live}
            </span>
          ) : (
            <span className="badge bg-neutral-700 text-white">{b.ended}</span>
          )}
          <span className="badge bg-neutral-100 text-neutral-600">
            <Gavel className="size-3.5" />
            {state.bidCount} {b.bids}
          </span>
        </div>

        {/* current bid */}
        <div className="text-center py-2">
          <p className="text-sm text-neutral-500 mb-1">
            {live ? b.current : b.finalPrice}
          </p>
          <p className="font-display font-extrabold text-4xl text-red-600" suppressHydrationWarning>
            {formatSAR(state.currentBid)}
          </p>
        </div>

        {/* countdown — key resets timer when anti-sniping extends it */}
        {live && (
          <div className="space-y-1.5">
            <p className="text-xs text-neutral-500 text-center">{b.timeLeft}</p>
            <Countdown key={state.endsAt} endsAt={state.endsAt} size="lg" onEnd={refresh} />
          </div>
        )}

        {/* winner banner */}
        {!live && state.winnerMasked && (
          <div className="rounded-lg bg-primary-50 border border-primary-200 p-3 text-center">
            <Crown className="size-5 text-primary-600 inline-block ml-1" />
            <span className="text-sm font-semibold text-primary-800">
              {b.winner}: {state.winnerMasked} — {formatSAR(state.currentBid)}
            </span>
          </div>
        )}

        {/* top bidder banner */}
        {live && state.isTopBidder && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 flex items-center gap-2 text-sm font-semibold text-green-700">
            <CheckCircle2 className="size-4.5 shrink-0" />
            {b.youTop}
          </div>
        )}

        {/* bid form */}
        {live &&
          (state.isSeller ? (
            <p className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2.5 text-sm text-neutral-500 text-center">
              {b.yourAuction}
            </p>
          ) : loggedIn ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const v = parseInt(amount, 10);
                if (!Number.isFinite(v)) return;
                placeBid(v);
              }}
            >
              <div className="flex gap-2">
                <input
                  dir="ltr"
                  inputMode="numeric"
                  className="input text-center font-bold tabular-nums"
                  value={amount}
                  onChange={(e) => {
                    amountTouched.current = true;
                    setAmount(e.target.value.replace(/[^\d]/g, ""));
                  }}
                  aria-label="مبلغ المزايدة"
                />
                <button className="btn-primary shrink-0 px-6" disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Gavel className="size-4" />
                  )}
                  {b.bidNow}
                </button>
              </div>

              <div className="flex gap-2">
                {quick.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      amountTouched.current = true;
                      setAmount(String(q));
                    }}
                    className="flex-1 rounded-lg border border-neutral-200 py-1.5 text-xs font-semibold tabular-nums text-neutral-600 hover:border-primary-400 hover:text-primary-600 transition-colors cursor-pointer"
                  >
                    {q.toLocaleString("en-US")}
                  </button>
                ))}
              </div>

              <p className="text-xs text-neutral-400 text-center">
                {b.minBid} {formatSAR(state.minNext)}
              </p>

              {state.buyNowPrice && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(b.buyNowConfirm(formatSAR(state.buyNowPrice!)))) {
                      placeBid(state.buyNowPrice!);
                    }
                  }}
                  disabled={submitting}
                  className="btn w-full bg-neutral-900 text-white hover:bg-neutral-800"
                >
                  <Zap className="size-4 text-primary-400" />
                  {b.buyNow} — {formatSAR(state.buyNowPrice)}
                </button>
              )}

              {/* ── proxy bidding ── */}
              <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 p-3 space-y-2">
                <p className="text-xs font-bold text-neutral-700 flex items-center gap-1.5">
                  <Bot className="size-4 text-primary-500" />
                  {b.proxyTitle}
                </p>
                {state.myProxyMax != null ? (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      {b.proxyActive(formatSAR(state.myProxyMax))}
                    </p>
                    <button
                      type="button"
                      onClick={cancelProxy}
                      disabled={proxyBusy}
                      className="act-btn text-neutral-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <X className="size-3.5" />
                      {b.proxyCancel}
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-neutral-500 leading-relaxed">{b.proxyHint}</p>
                )}
                <div className="flex gap-2">
                  <input
                    dir="ltr"
                    inputMode="numeric"
                    className="input !min-h-9 text-center text-sm font-bold tabular-nums"
                    placeholder={b.proxyPlaceholder}
                    value={proxyMax}
                    onChange={(e) => setProxyMax(e.target.value.replace(/[^\d]/g, ""))}
                    aria-label={b.proxyPlaceholder}
                  />
                  <button
                    type="button"
                    onClick={setProxy}
                    disabled={proxyBusy || !proxyMax}
                    className="btn-secondary !min-h-9 shrink-0 text-xs"
                  >
                    {proxyBusy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Bot className="size-3.5" />
                    )}
                    {state.myProxyMax != null ? b.proxyUpdate : b.proxySet}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <Link href="/login" className="btn-primary w-full">
              {b.loginToBid}
            </Link>
          ))}

        {error && (
          <p className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </p>
        )}
        {flash && !error && (
          <p className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            <CheckCircle2 className="size-4 shrink-0" />
            {flash}
          </p>
        )}
      </div>

      {/* bid history */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm">
          {b.history}
        </div>
        {state.bids.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-400 text-center">
            {b.noBids}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-50 max-h-80 overflow-y-auto">
            {state.bids.map((bid, i) => (
              <li
                key={bid.id}
                className={cn(
                  "flex items-center justify-between px-4 py-2.5 text-sm",
                  i === 0 && "bg-primary-50/60"
                )}
              >
                <span className="flex items-center gap-2 font-medium text-neutral-700">
                  {i === 0 && <Crown className="size-4 text-primary-500" />}
                  {bid.name}
                  {bid.mine && (
                    <span className="badge bg-primary-100 text-primary-700">{b.you}</span>
                  )}
                </span>
                <span className="tabular-nums font-bold text-neutral-900">
                  {formatSAR(bid.amount)}
                </span>
                <span className="text-xs text-neutral-400 w-20 text-left" suppressHydrationWarning>
                  {timeAgo(bid.at, lang)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
