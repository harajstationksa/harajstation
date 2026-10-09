"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminAction, AdminResult } from "@/lib/admin";

export function AdminActionForm({
  action,
  children,
  confirm,
  success = "تم حفظ التغييرات",
  stepUpAction,
  ...props
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, "action"> & {
  action: AdminAction;
  confirm?: string;
  success?: string;
  stepUpAction?: () => Promise<AdminResult>;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [challenge, setChallenge] = useState("");
  const router = useRouter();
  const flight = useRef(false),
    requestId = useRef("");
  return (
    <form
      {...props}
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        if (flight.current || ((!stepUpAction || challenge) && confirm && !window.confirm(confirm)))
          return;
        flight.current = true;
        if (!requestId.current) requestId.current = crypto.randomUUID();
        if (!data.has("requestId")) data.set("requestId", requestId.current);
        setBusy(true);
        setResult(null);
        try {
          if (stepUpAction && !challenge) {
            const issued = await stepUpAction();
            setResult(issued);
            if (issued.ok && issued.challenge) setChallenge(issued.challenge);
            return;
          }
          if (stepUpAction) data.set("challenge", challenge);
          const response = await action(data);
          setResult(response ?? { ok: true, message: success });
          if (!response || response.ok) {
            requestId.current = "";
            setChallenge("");
            router.refresh();
          }
        } catch {
          setResult({
            ok: false,
            message: "تعذّر إكمال العملية. حاول مجددًا بعد مراجعة الاتصال.",
          });
        } finally {
          flight.current = false;
          setBusy(false);
        }
      }}
      aria-busy={busy}
    >
      <fieldset
        disabled={busy}
        className={stepUpAction && challenge ? "contents [&_button]:hidden" : "contents"}
      >
        {children}
      </fieldset>
      {stepUpAction && challenge && (
        <fieldset disabled={busy} className="admin-stepup mt-3 space-y-3">
          <label className="block text-xs font-semibold text-neutral-700 mt-3">
            رمز تأكيد إدارة الفريق المرسل إلى بريدك
            <input
              name="code"
              className="input mt-1.5 max-w-48"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              minLength={6}
              autoComplete="one-time-code"
              required
              dir="ltr"
            />
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <button type="submit" className="btn-primary">
              تأكيد الرمز وتنفيذ الإجراء
            </button>
            <button
              type="button"
              className="text-xs text-primary-600"
              onClick={() => {
                setChallenge("");
                setResult(null);
              }}
            >
              طلب رمز جديد
            </button>
          </div>
        </fieldset>
      )}
      {busy && (
        <p role="status" className="text-xs text-neutral-500">
          جارٍ التنفيذ…
        </p>
      )}
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`text-xs rounded-lg px-3 py-2 ${result.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
