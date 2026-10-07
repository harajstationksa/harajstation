export const ADMIN_STATUS_LABELS: Record<string, string> = {
  PENDING: "بانتظار المعالجة",
  PAID: "مدفوع",
  FAILED: "فشل الدفع",
  CONFIRMED: "مؤكد",
  CANCELLED: "ملغى",
  DISPUTED: "محل نزاع",
  EXPIRED: "منتهي",
  ACTIVE: "نشط",
  REJECTED: "مرفوض",
  APPROVED: "مقبول",
  OPEN: "مفتوح",
  RESOLVED: "تمت المعالجة",
  DISMISSED: "تم الحفظ",
  SOLD: "تم البيع",
  HIDDEN: "مخفي",
  ENDED: "انتهى",
};

export function AdminStatusBadge({ status }: { status: string }) {
  const color = ["PAID", "CONFIRMED", "APPROVED", "ACTIVE", "RESOLVED"].includes(status)
    ? "bg-emerald-50 text-emerald-700"
    : ["FAILED", "REJECTED", "DISPUTED"].includes(status)
      ? "bg-red-50 text-red-700"
      : ["PENDING", "OPEN"].includes(status)
        ? "bg-amber-50 text-amber-800"
        : "bg-neutral-100 text-neutral-600";
  return (
    <span className={`badge whitespace-nowrap ${color}`}>
      {ADMIN_STATUS_LABELS[status] ?? status}
    </span>
  );
}
