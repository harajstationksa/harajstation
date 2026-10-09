import { db } from "./db";
import { Prisma } from "@prisma/client";
import { requireStaff } from "./auth";
import { notifyWithClient } from "./notify";
import { audit, ok, fail, text } from "./admin";
import { revalidatePath } from "next/cache";
import { canUseStaffGate } from "./staff-permissions";
export async function reviewVerification(
  kind: "identity" | "store",
  approved: boolean,
  data: FormData,
) {
  const permission = kind === "identity" ? "identity.review" : "stores.review";
  const actor = await requireStaff(["ADMIN", "MODERATOR"], permission),
    id = text(data.get("requestId")),
    note = text(data.get("note"), 1000) || "يرجى رفع وثيقة أوضح";
  const result = await db.$transaction(async (tx) => {
    const request =
      kind === "identity"
        ? await tx.identityVerification.findUnique({ where: { id } })
        : await tx.storeVerification.findUnique({
            where: { id },
            include: { store: true },
          });
    if (!request) return fail("الطلب لم يعد متاحًا؛ حدّث الصفحة");
    const ownerId = "userId" in request ? request.userId : request.store.userId;
    const locks = [...new Set([actor.id, ownerId])].sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "User" WHERE id IN (${Prisma.join(locks)}) ORDER BY id FOR UPDATE`,
    );
    const staff = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (
      staff.isBanned ||
      staff.sessionVersion !== actor.sessionVersion ||
      !canUseStaffGate(staff, ["ADMIN", "MODERATOR"], permission)
    )
      return fail("تغيرت صلاحيات حسابك");
    const values = {
      status: approved ? "APPROVED" : "REJECTED",
      reviewedAt: new Date(),
      note: approved ? null : note,
    };
    const changed =
      kind === "identity"
        ? await tx.identityVerification.updateMany({
            where: { id, status: "PENDING" },
            data: values,
          })
        : await tx.storeVerification.updateMany({
            where: { id, status: "PENDING" },
            data: values,
          });
    if (changed.count !== 1) return fail("اتُخذ قرار في هذا الطلب بالفعل؛ حدّث الصفحة");
    let userId: string;
    if (kind === "identity") {
      const row = await tx.identityVerification.findUniqueOrThrow({
        where: { id },
      });
      userId = row.userId;
      await tx.user.update({
        where: { id: userId },
        data: { idVerified: approved },
      });
    } else {
      const row = await tx.storeVerification.findUniqueOrThrow({
        where: { id },
        include: { store: true },
      });
      userId = row.store.userId;
      await tx.store.update({
        where: { id: row.storeId },
        data: { isVerified: approved },
      });
    }
    await audit(
      tx,
      actor.id,
      `${approved ? "APPROVE" : "REJECT"}_${kind.toUpperCase()}`,
      `${id}; ${approved ? "approved" : note}`,
    );
    await notifyWithClient(
      tx,
      [userId],
      "SYSTEM",
      approved ? "تم اعتماد التوثيق" : "تعذّر اعتماد التوثيق",
      approved ? "تمت مراجعة الوثيقة واعتماد الشارة." : `سبب الرفض: ${note}`,
      kind === "identity" ? "/dashboard/settings" : "/dashboard/store",
      `verification:${kind}:${id}:${values.reviewedAt.toISOString()}`,
    );
    return ok(approved ? "تم اعتماد التوثيق" : "تم رفض الطلب وإبلاغ صاحبه");
  });
  if (result.ok) revalidatePath(`/admin/${kind === "identity" ? "identity" : "stores"}`);
  return result;
}
