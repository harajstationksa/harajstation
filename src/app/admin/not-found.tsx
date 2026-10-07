import Link from "next/link";
import { AdminEmptyState } from "@/components/AdminEmptyState";

export default function NotFound() {
  return (
    <AdminEmptyState
      title="المحتوى غير موجود"
      hint="ربما حُذف هذا المحتوى أو تغير الرابط."
      action={
        <Link href="/admin/account" className="btn-primary">
          العودة إلى حسابي
        </Link>
      }
    />
  );
}
