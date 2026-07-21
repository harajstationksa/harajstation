"use client";

import { LogOut } from "lucide-react";

/** Ends the admin-portal session (its own cookie, separate from the site). */
export function AdminLogout({ className }: { className?: string }) {
  async function logout() {
    await fetch("/api/admin-auth/logout", { method: "POST" });
    window.location.href = "/admin-login";
  }
  return (
    <button
      onClick={logout}
      title="تسجيل الخروج"
      className={className}
    >
      <LogOut className="size-4" />
    </button>
  );
}
