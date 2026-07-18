import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { confirmPayment } from "@/lib/payments";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.dash.payConfirm.title };
}

/** Moyasar redirects here after checkout — verify server-side and credit. */
export default async function PaymentConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const user = await requireUser();
  const { t } = await getT();
  const d = t.dash.payConfirm;
  const { p } = await searchParams;

  const payment = p ? await db.payment.findUnique({ where: { id: p } }) : null;
  const result =
    payment && payment.userId === user.id ? await confirmPayment(payment.id) : "not_found";

  const view = {
    paid: {
      icon: <CheckCircle2 className="size-12 text-green-600 mx-auto" />,
      title: d.paidTitle,
      body: d.paidBody(payment?.points.toLocaleString("en-US") ?? "0"),
    },
    pending: {
      icon: <Clock className="size-12 text-amber-500 mx-auto" />,
      title: d.pendingTitle,
      body: d.pendingBody,
    },
    failed: {
      icon: <XCircle className="size-12 text-red-600 mx-auto" />,
      title: d.failedTitle,
      body: d.failedBody,
    },
    not_found: {
      icon: <XCircle className="size-12 text-red-600 mx-auto" />,
      title: d.notFoundTitle,
      body: d.notFoundBody,
    },
  }[result];

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="card w-full max-w-md p-8 text-center space-y-4">
        {view.icon}
        <h1 className="font-display font-bold text-2xl">{view.title}</h1>
        <p className="text-sm text-neutral-500 leading-relaxed">{view.body}</p>
        <Link href="/dashboard/wallet" className="btn-primary w-full">
          {d.backToWallet}
        </Link>
      </div>
    </div>
  );
}
