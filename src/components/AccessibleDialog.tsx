"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Native modal provides focus containment, inert background and focus restoration. */
export function AccessibleDialog({
  children,
  label,
  onClose,
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog
      ref={ref}
      aria-label={label}
      aria-modal="true"
      className="m-0 p-0 border-0 max-w-none max-h-none w-screen h-dvh bg-transparent"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
          ),
        ].filter((item) => item.getClientRects().length > 0);
        const first = items[0],
          last = items.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      {children}
    </dialog>,
    document.body,
  );
}
