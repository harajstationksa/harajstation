"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { counterOfferAction } from "@/app/(site)/dashboard/offers/actions";
import { useLang } from "./LangProvider";

/** Inline seller counter: tap «عرض مضاد», type a price, send. */
export function CounterOfferForm({ offerId }: { offerId: string }) {
  const router = useRouter();
  const { t } = useLang();
  const o = t.offers;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="act-btn bg-sky-50 text-sky-700 hover:bg-sky-100"
      >
        <ArrowLeftRight className="size-3.5" />
        {o.counter}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        className="input h-8 w-32 text-sm"
        inputMode="numeric"
        pattern="\d*"
        autoFocus
        placeholder={o.counterPh}
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
      />
      <button
        type="button"
        disabled={pending || !amount}
        className="act-btn bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
        onClick={() => {
          setError("");
          startTransition(async () => {
            const fd = new FormData();
            fd.set("offerId", offerId);
            fd.set("counterAmount", amount);
            const res = await counterOfferAction(fd);
            if ("error" in res && res.error) setError(res.error);
            else router.refresh();
          });
        }}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : o.sendCounter}
      </button>
      <button
        type="button"
        className="act-btn bg-neutral-100 text-neutral-500"
        onClick={() => setOpen(false)}
      >
        {o.cancel}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
