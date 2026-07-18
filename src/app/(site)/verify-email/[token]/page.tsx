import { getT } from "@/lib/i18n";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.pub.verifyOkTitle.replace(" ✅", "") };
}

/** Landing page for the emailed confirmation link — single-use, 48h TTL. */
export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { t } = await getT();
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
            <h1 className="font-display font-bold text-2xl">{t.pub.verifyOkTitle}</h1>
            <p className="text-sm text-neutral-500">
              {t.pub.verifyOkBody}
            </p>
            <Link href="/" className="btn-primary w-full">
              {t.pub.startBrowsing}
            </Link>
          </>
        ) : (
          <>
            <XCircle className="size-12 text-red-600 mx-auto" />
            <h1 className="font-display font-bold text-2xl">{t.pub.verifyBadTitle}</h1>
            <p className="text-sm text-neutral-500">
              {t.pub.verifyBadBody}
            </p>
            <Link href="/dashboard" className="btn-primary w-full">
              {t.pub.goDashboard}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
