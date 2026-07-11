import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SettingsForm } from "@/components/SettingsForm";
import { IdentityVerifyCard } from "@/components/IdentityVerifyCard";
import { DeleteAccountCard } from "@/components/DeleteAccountCard";

export const dynamic = "force-dynamic";

export const metadata = { title: "إعدادات الحساب" };

export default async function SettingsPage() {
  const user = await requireUser();
  const idReq = await db.identityVerification.findUnique({
    where: { userId: user.id },
    select: { status: true, note: true },
  });

  return (
    <div className="space-y-5">
      <h1 className="section-title">إعدادات الحساب</h1>
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
      <IdentityVerifyCard
        verified={user.idVerified}
        status={(idReq?.status as "PENDING" | "APPROVED" | "REJECTED") ?? null}
        note={idReq?.note ?? null}
      />
      <DeleteAccountCard />
    </div>
  );
}
