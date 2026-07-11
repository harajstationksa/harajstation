import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { confirmPayment } from "@/lib/payments";

export const dynamic = "force-dynamic";

export const metadata = { title: "تأكيد الدفع" };

/** Moyasar redirects here after checkout — verify server-side and credit. */
export default async function PaymentConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const user = await requireUser();
  const { p } = await searchParams;

  const payment = p ? await db.payment.findUnique({ where: { id: p } }) : null;
  const result =
    payment && payment.userId === user.id ? await confirmPayment(payment.id) : "not_found";

  const view = {
    paid: {
      icon: <CheckCircle2 className="size-12 text-green-600 mx-auto" />,
      title: "تم الدفع بنجاح 🎉",
      body: `أُضيفت ${payment?.points.toLocaleString("en-US")} نقطة لرصيدك — استخدمها لتمييز إعلاناتك أو إطلاق حملة.`,
    },
    pending: {
      icon: <Clock className="size-12 text-amber-500 mx-auto" />,
      title: "الدفع قيد المعالجة",
      body: "لم يتأكد الدفع بعد — سيُضاف رصيدك تلقائياً فور التأكيد. حدّث الصفحة بعد لحظات.",
    },
    failed: {
      icon: <XCircle className="size-12 text-red-600 mx-auto" />,
      title: "لم يكتمل الدفع",
      body: "أُلغيت العملية أو فشلت — لم يُخصم منك شيء. جرّب مرة أخرى.",
    },
    not_found: {
      icon: <XCircle className="size-12 text-red-600 mx-auto" />,
      title: "عملية غير معروفة",
      body: "لم نعثر على عملية الدفع هذه.",
    },
  }[result];

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="card w-full max-w-md p-8 text-center space-y-4">
        {view.icon}
        <h1 className="font-display font-bold text-2xl">{view.title}</h1>
        <p className="text-sm text-neutral-500 leading-relaxed">{view.body}</p>
        <Link href="/dashboard/wallet" className="btn-primary w-full">
          العودة للمحفظة
        </Link>
      </div>
    </div>
  );
}
