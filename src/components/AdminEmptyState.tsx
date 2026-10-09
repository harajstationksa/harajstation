import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

export function AdminEmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card admin-empty">
      <span className="admin-empty-icon" aria-hidden="true">
        <Inbox size={28} strokeWidth={1.5} />
      </span>
      <p className="font-semibold text-neutral-700">{title}</p>
      <p className="text-xs mt-2 mb-4">{hint ?? "ستظهر البيانات هنا عند توفرها."}</p>
      {action}
    </div>
  );
}
