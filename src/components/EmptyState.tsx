import { PackageOpen } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 py-16 px-6 text-center">
      <PackageOpen className="size-10 text-neutral-300" />
      <p className="font-semibold text-neutral-700">{title}</p>
      {hint && <p className="text-sm text-neutral-500">{hint}</p>}
      {action}
    </div>
  );
}
