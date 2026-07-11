import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "تأكيد البريد الإلكتروني" };

/** Landing page for the emailed confirmation link — single-use, 48h TTL. */
export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const row = await db.emailVerificationToken.findUnique({
    where: { token },
    include: { user: true },
  });

  let ok = false;
  if (row && !row.usedAt && row.expiresAt > new Date() && !row.user.isBanned) {
    await db.$transaction([
      db.emailVerificationToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      db.user.update({
        where: { id: row.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);
    ok = true;
  } else if (row?.usedAt && row.user.emailVerifiedAt) {
    ok = true; // clicking the link twice still shows success
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center py-12 px-4">
      <div className="card w-full max-w-md p-8 text-center space-y-4">
        {ok ? (
          <>
            <CheckCircle2 className="size-12 text-green-600 mx-auto" />
            <h1 className="font-display font-bold text-2xl">تم تأكيد بريدك ✅</h1>
            <p className="text-sm text-neutral-500">
              شكراً لك — حسابك أصبح مؤكد البريد وجاهز تماماً.
            </p>
            <Link href="/" className="btn-primary w-full">
              ابدأ التصفح
            </Link>
          </>
        ) : (
          <>
            <XCircle className="size-12 text-red-600 mx-auto" />
            <h1 className="font-display font-bold text-2xl">رابط غير صالح</h1>
            <p className="text-sm text-neutral-500">
              الرابط منتهي الصلاحية أو استُخدم من قبل — اطلب رابطاً جديداً من لوحة التحكم.
            </p>
            <Link href="/dashboard" className="btn-primary w-full">
              الذهاب للوحة التحكم
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
