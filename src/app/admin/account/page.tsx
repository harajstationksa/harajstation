import { AdminPageHeader } from "@/components/AdminPageHeader";
import { requireStaff } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/constants";
import { AdminAccountForms } from "@/components/AdminAccountForms";
import { AdminTotpCard } from "@/components/AdminTotpCard";
export const dynamic = "force-dynamic";
export const metadata = { title: "حسابي" };
export default async function Page() {
  const me = await requireStaff(STAFF_ROLES);
  return (
    <div className="max-w-4xl space-y-5">
      <AdminPageHeader
        section="account"
        description={
          <>
            رمز البريد مطلوب لكل دخول، ولتأكيد التغييرات الحساسة. فعّل تطبيق المصادقة ليصبح الدخول
            بعاملين مستقلين.
          </>
        }
      >
        حسابي
      </AdminPageHeader>
      <AdminTotpCard enabled={!!me.totpEnabledAt} />
      <AdminAccountForms name={me.name} email={me.email} passwordEnabled={me.passwordEnabled} />
    </div>
  );
}
