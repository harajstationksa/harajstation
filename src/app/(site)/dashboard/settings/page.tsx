import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SettingsForm } from "@/components/SettingsForm";
import { ChangePasswordCard } from "@/components/ChangePasswordCard";
import { TwoFactorCard } from "@/components/TwoFactorCard";
import { IdentityVerifyCard } from "@/components/IdentityVerifyCard";
import { DeleteAccountCard } from "@/components/DeleteAccountCard";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.dash.settingsPage.title };
}

export default async function SettingsPage() {
  const user = await requireUser();
  const { t } = await getT();
  const idReq = await db.identityVerification.findUnique({
    where: { userId: user.id },
    select: { status: true, note: true },
  });

  return (
    <div className="space-y-5">
      <h1 className="section-title">{t.dash.settingsPage.title}</h1>
      <SettingsForm
        initial={{
          name: user.name,
          city: user.city,
          phone: user.phone ?? "",
          email: user.email,
          avatarUrl: user.avatarUrl,
          avatarColor: user.avatarColor,
        }}
      />
      <ChangePasswordCard email={user.email} />
      <TwoFactorCard email={user.email} initialEnabled={user.twoFactorEmail} />
      <IdentityVerifyCard
        verified={user.idVerified}
        status={(idReq?.status as "PENDING" | "APPROVED" | "REJECTED") ?? null}
        note={idReq?.note ?? null}
      />
      <DeleteAccountCard />
    </div>
  );
}
