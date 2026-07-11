"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { notify } from "@/lib/notify";

/** Approve an ID verification: sets the «موثّق» badge and notifies the user. */
export async function approveIdentityAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN", "MODERATOR"]);
  const id = String(formData.get("requestId"));
  const req = await db.identityVerification.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return;

  await db.$transaction([
    db.identityVerification.update({
      where: { id },
      data: { status: "APPROVED", reviewedAt: new Date(), note: null },
    }),
    db.user.update({ where: { id: req.userId }, data: { idVerified: true } }),
    db.auditLog.create({
      data: { actorId: staff.id, action: "APPROVE_IDENTITY", detail: req.userId },
    }),
  ]);
  await notify(
    req.userId,
    "SYSTEM",
    "تم توثيق هويتك ✅",
    "تمت مراجعة هويتك بنجاح — أصبحت شارة «موثّق» ظاهرة على حسابك.",
    "/dashboard/settings"
  );
  revalidatePath("/admin/identity");
}

/** Reject an ID verification with a reason the user can act on. */
export async function rejectIdentityAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN", "MODERATOR"]);
  const id = String(formData.get("requestId"));
  const note = String(formData.get("note") ?? "").trim() || "الصورة غير واضحة";
  const req = await db.identityVerification.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return;

  await db.$transaction([
    db.identityVerification.update({
      where: { id },
      data: { status: "REJECTED", reviewedAt: new Date(), note },
    }),
    db.auditLog.create({
      data: { actorId: staff.id, action: "REJECT_IDENTITY", detail: `${req.userId}: ${note}` },
    }),
  ]);
  await notify(
    req.userId,
    "SYSTEM",
    "تعذّر توثيق هويتك",
    `السبب: ${note} — يمكنك إعادة رفع صورة أوضح من الإعدادات.`,
    "/dashboard/settings"
  );
  revalidatePath("/admin/identity");
}
