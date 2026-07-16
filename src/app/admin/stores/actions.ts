"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { notify } from "@/lib/notify";

/** Approve a store verification: sets «متجر موثّق» and notifies the owner. */
export async function approveStoreAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN", "MODERATOR"]);
  const id = String(formData.get("requestId"));
  const req = await db.storeVerification.findUnique({
    where: { id },
    include: { store: true },
  });
  if (!req || req.status !== "PENDING") return;

  await db.$transaction([
    db.storeVerification.update({
      where: { id },
      data: { status: "APPROVED", reviewedAt: new Date(), note: null },
    }),
    db.store.update({ where: { id: req.storeId }, data: { isVerified: true } }),
    db.auditLog.create({
      data: { actorId: staff.id, action: "APPROVE_STORE", detail: req.storeId },
    }),
  ]);
  await notify(
    req.store.userId,
    "SYSTEM",
    "تم توثيق متجرك ✅",
    `تمت مراجعة وثائق «${req.store.name}» بنجاح — شارة «متجر موثّق» أصبحت ظاهرة للزوار.`,
    `/store/${req.store.slug}`
  );
  revalidatePath("/admin/stores");
}

/** Reject a store verification with a reason the owner can act on. */
export async function rejectStoreAction(formData: FormData) {
  const staff = await requireStaff(["ADMIN", "MODERATOR"]);
  const id = String(formData.get("requestId"));
  const note = String(formData.get("note") ?? "").trim() || "الوثيقة غير واضحة";
  const req = await db.storeVerification.findUnique({
    where: { id },
    include: { store: true },
  });
  if (!req || req.status !== "PENDING") return;

  await db.$transaction([
    db.storeVerification.update({
      where: { id },
      data: { status: "REJECTED", reviewedAt: new Date(), note },
    }),
    db.auditLog.create({
      data: { actorId: staff.id, action: "REJECT_STORE", detail: `${req.storeId}: ${note}` },
    }),
  ]);
  await notify(
    req.store.userId,
    "SYSTEM",
    "تعذّر توثيق متجرك",
    `السبب: ${note} — يمكنك إعادة رفع وثيقة أوضح من صفحة «متاجري».`,
    "/dashboard/store"
  );
  revalidatePath("/admin/stores");
}
