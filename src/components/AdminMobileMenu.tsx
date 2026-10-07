"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, ShieldCheck, X } from "lucide-react";
import { AdminNav } from "./AdminNav";
import { ROLE_LABELS } from "@/lib/constants";
import { AdminLogout } from "./AdminLogout";

export function AdminMobileMenu({
  role,
  staffPermissions,
}: {
  role: string;
  staffPermissions: string;
}) {
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    const openerNode = opener.current;
    const background = openerNode?.closest<HTMLElement>(".admin-shell");
    const wasInert = background?.inert ?? false;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    if (background) background.inert = true;
    closeButton.current?.focus();
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [
        ...panel.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input:not(:disabled)",
        ),
      ];
      const first = focusable[0],
        last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      document.documentElement.style.overflow = htmlOverflow;
      if (background) background.inert = wasInert;
      desktop.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("keydown", onKey);
      openerNode?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        className="admin-menu-toggle lg:hidden size-11 rounded-xl border border-neutral-200 bg-white text-neutral-800 flex items-center justify-center shrink-0"
        aria-label="فتح قائمة الإدارة"
        aria-expanded={open}
        aria-controls="admin-mobile-nav"
      >
        <Menu className="size-5" />
      </button>
      {open &&
        createPortal(
          <div
            className="admin-shell admin-mobile-overlay lg:hidden"
            onClick={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <aside
              ref={panel}
              id="admin-mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-label="قائمة الإدارة"
              className="admin-mobile-panel admin-sidebar"
            >
              <div className="admin-mobile-heading">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="admin-brand-mark">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo.png" alt="" />
                  </span>
                  <span>
                    <span className="block font-display font-extrabold">حراج ستيشن</span>
                    <span className="block text-xs text-neutral-500">لوحة الإدارة</span>
                  </span>
                </div>
                <button
                  ref={closeButton}
                  type="button"
                  onClick={() => setOpen(false)}
                  className="size-11 shrink-0 rounded-xl bg-neutral-100 flex items-center justify-center"
                  aria-label="إغلاق القائمة"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="admin-mobile-links">
                <AdminNav
                  role={role}
                  staffPermissions={staffPermissions}
                  drawer
                  onNavigate={() => setOpen(false)}
                />
              </div>
              <div className="admin-mobile-footer">
                <span>
                  <span className="block text-sm font-semibold">{ROLE_LABELS[role] ?? role}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
                    <ShieldCheck size={14} className="text-emerald-600" /> جلسة محمية
                  </span>
                </span>
                <AdminLogout className="size-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center" />
              </div>
            </aside>
          </div>,
          document.body,
        )}
    </>
  );
}
