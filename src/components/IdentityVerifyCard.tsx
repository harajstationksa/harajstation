"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BadgeCheck, Clock, Loader2, ShieldCheck, Upload, XCircle } from "lucide-react";
import { useLang } from "@/components/LangProvider";

/**
 * «توثيق الهوية» card in account settings: upload an ID document for manual
 * review. The document is stored privately and seen by staff only.
 */
export function IdentityVerifyCard({
  verified,
  status,
  note,
}: {
  verified: boolean;
  status: "PENDING" | "APPROVED" | "REJECTED" | null;
  note: string | null;
}) {
  const { t } = useLang();
  const d = t.dash.settings;
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(d.idPickFirst);
      return;
    }
    setLoading(true);
    setError("");
    const fd = new FormData();
    fd.set("document", file);
    const res = await fetch("/api/identity", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? d.genericError);
      return;
    }
    router.refresh();
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary-600" />
        <h2 className="font-bold">{d.idTitle}</h2>
        {verified && (
          <span className="badge bg-green-50 text-green-700">
            <BadgeCheck className="size-3.5" />
            {d.idVerified}
          </span>
        )}
      </div>

      {verified ? (
        <p className="text-sm text-neutral-500">
          {d.idVerifiedBody}
        </p>
      ) : status === "PENDING" ? (
        <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
          <Clock className="size-4 shrink-0 mt-0.5" />
          {d.idPending}
        </p>
      ) : (
        <>
          <p className="text-sm text-neutral-500 leading-relaxed">
            {d.idBody}
          </p>

          {status === "REJECTED" && (
            <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
              <XCircle className="size-4 shrink-0 mt-0.5" />
              {d.idRejected(note ?? "")}
            </p>
          )}

          <form onSubmit={submit} className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="text-sm file:btn-secondary file:me-3 file:cursor-pointer"
            />
            <button className="btn-primary" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {d.idSubmit}
            </button>
          </form>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
