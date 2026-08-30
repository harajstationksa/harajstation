"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

/** Ends the admin-portal session (its own cookie, separate from the site). */
export function AdminLogout({ className }: { className?: string }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/admin-auth/logout", { method: "POST" });
    router.push("/admin-login");
    router.refresh();
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
