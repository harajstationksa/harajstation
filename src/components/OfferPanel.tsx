"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { HandCoins, Loader2, X } from "lucide-react";
import { formatSAR } from "@/lib/utils";
import {
  acceptCounterAction,
  makeOfferAction,
  withdrawOfferAction,
} from "@/app/(site)/dashboard/offers/actions";
import { useLang } from "./LangProvider";

export type MyOffer = {
  id: string;
  amount: number;
  status: string;
  counterAmount: number | null;
};

/**
 * Buyer side of سوم on the listing page: make an offer, watch its status,
 * accept the seller's counter or withdraw — without leaving the listing.
 */
export function OfferPanel({
  listingId,
  loggedIn,
  myOffer,
}: {
  listingId: string;
  loggedIn: boolean;
  myOffer: MyOffer | null;
}) {
  const router = useRouter();
  const { t } = useLang();
  const o = t.offers;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function run(action: (fd: FormData) => Promise<{ ok?: boolean; error?: string }>, fd: FormData) {
    setError("");
    startTransition(async () => {
      const res = await action(fd);
      if ("error" in res && res.error) setError(res.error);
      else {
        setOpen(false);
        setAmount("");
        setNote("");
        router.refresh();
      }
    });
  }

  if (!loggedIn) {
    return (
      <Link href="/login" className="btn-secondary w-full">
        <HandCoins className="size-4" />
        {o.loginFirst}
      </Link>
    );
  }

  // an open offer — show where the سوم stands
  if (myOffer && (myOffer.status === "PENDING" || myOffer.status === "COUNTERED")) {
    return (
      <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-3.5 space-y-2.5">
        <p className="text-sm font-bold flex items-center gap-2">
          <HandCoins className="size-4 text-primary-500" />
          {o.yourOffer}: <span className="tabular-nums">{formatSAR(myOffer.amount)}</span>
        </p>
        {myOffer.status === "PENDING" ? (
          <p className="text-xs text-neutral-500">{o.waitingSeller}</p>
        ) : (
          <p className="text-sm text-neutral-800">
            {o.sellerCounter}:{" "}
            <b className="tabular-nums text-primary-700">
              {formatSAR(myOffer.counterAmount ?? 0)}
            </b>
          </p>
        )}
        <div className="flex gap-2">
          {myOffer.status === "COUNTERED" && (
            <button
              className="btn-primary flex-1"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("offerId", myOffer.id);
                run(acceptCounterAction, fd);
              }}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {o.acceptCounter}
            </button>
          )}
          <button
            className="btn-secondary"
            disabled={pending}
            onClick={() => {
              const fd = new FormData();
              fd.set("offerId", myOffer.id);
              run(withdrawOfferAction, fd);
            }}
          >
            <X className="size-4" />
            {o.withdraw}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary w-full">
        <HandCoins className="size-4 text-primary-500" />
        {o.makeOffer}
      </button>
    );
  }

  return (
    <form
      className="rounded-xl border border-neutral-200 p-3.5 space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("listingId", listingId);
        fd.set("amount", amount);
        fd.set("note", note);
        run(makeOfferAction, fd);
      }}
    >
      <p className="text-sm font-bold">{o.makeOffer}</p>
      <input
        className="input"
        inputMode="numeric"
        pattern="\d*"
        required
        placeholder={o.amountPh}
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
      />
      <input
        className="input"
        maxLength={200}
        placeholder={o.notePh}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={pending || !amount}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <HandCoins className="size-4" />}
          {o.send}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          {o.cancel}
        </button>
      </div>
      <p className="text-[11px] text-neutral-400 leading-relaxed">{o.hint}</p>
    </form>
  );
}
