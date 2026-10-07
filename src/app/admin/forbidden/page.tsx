import { AdminPageHeader } from "@/components/AdminPageHeader";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/constants";
import { staffHomePath } from "@/lib/staff-permissions";
export default async function ForbiddenPage() {
  const actor = await requireStaff(STAFF_ROLES);
  return (
    <div className="card p-8 space-y-4">
      <AdminPageHeader
        section="forbidden"
        description={<>جلسة دخولك ما زالت فعّالة. يمكنك العودة إلى الصفحات المتاحة لك.</>}
      >
        هذه الصفحة خارج صلاحيات حسابك
      </AdminPageHeader>
      <Link href={staffHomePath(actor)} className="btn-primary">
        العودة إلى صفحة متاحة
      </Link>
    </div>
  );
}
