"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import Link from "next/link";

export default function AdminError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="card admin-empty" role="alert">
      <span className="admin-empty-icon text-red-500">
        <AlertCircle size={28} />
      </span>
      <h2 className="font-display text-xl font-bold">تعذّر تحميل هذه الصفحة</h2>
      <p className="text-sm mt-2">حاول مجددًا. إذا استمرت المشكلة، تواصل مع مدير المنصة.</p>
      <div className="flex justify-center gap-3 flex-wrap mt-6">
        <button type="button" onClick={retry} className="btn-primary">
          <RotateCcw size={16} /> إعادة المحاولة
        </button>
        <Link href="/admin/account" className="btn-secondary">
          حسابي
        </Link>
      </div>
    </div>
  );
}
