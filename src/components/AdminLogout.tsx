"use client";

import { clientFetch } from "@/lib/client-fetch";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

/** Ends the admin-portal session (its own cookie, separate from the site). */
export function AdminLogout({ className }: { className?: string }) {
  const router = useRouter();
  async function logout() {
    const response = await clientFetch("/api/admin-auth/logout", {
      method: "POST",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      window.alert(data.error);
      return;
    }
    router.push("/admin-login");
    router.refresh();
  }
  return (
    <button onClick={logout} title="تسجيل الخروج" className={className}>
      <LogOut className="size-4" />
    </button>
  );
}
