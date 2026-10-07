"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Submit button for server-action forms with an optional confirm dialog and
 * pending spinner. Place inside a <form action={serverAction}>.
 */
export function ConfirmSubmit({
  children,
  confirm,
  className,
}: {
  children: React.ReactNode;
  confirm?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={cn("cursor-pointer disabled:opacity-50", className)}
    >
      {pending && <Loader2 className="size-3 animate-spin" />}
      {children}
    </button>
  );
}
