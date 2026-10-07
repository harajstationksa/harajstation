import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { canUseStaffGate, parseStaffPermissions } from "@/lib/staff-permissions";
import { sendEmail, sendLoginCodeEmail } from "@/lib/email";

const state = vi.hoisted(() => ({ actor: "", code: "" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", async (original) => ({
  ...(await original<typeof import("@/lib/email")>()),
  sendEmail: vi.fn(async () => true),
  emailConfigured: () => true,
  sendLoginCodeEmail: vi.fn(async (_email: string, code: string) => {
    state.code = code;
    return true;
  }),
}));
vi.mock("@/lib/auth", async (original) => {
  const real = await original<typeof import("@/lib/auth")>();
  return {
    ...real,
    requireStaff: async (roles: string[], permission?: string) => {
      const user = await (
        await import("@/lib/db")
      ).db.user.findUniqueOrThrow({ where: { id: state.actor } });
      if (!canUseStaffGate(user, roles, permission as Parameters<typeof canUseStaffGate>[2]))
        throw new Error("FORBIDDEN");
      return user;
    },
  };
});
import {
  createStaffAction,
  requestStaffChangeCodeAction,
  updateStaffPermissionsAction,
  toggleBanAction,
  adjustUserPointsAction,
  resendStaffInviteAction,
  updateStaffRoleAction,
} from "@/app/admin/actions";

const mark = `staff-permissions-${Date.now()}`;
const adminId = `${mark}-admin`,
  normalId = `${mark}-normal`;
let employeeId = "";
const form = (fields: Record<string, string>, permissions: string[] = []) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  for (const permission of permissions) data.append("permissions", permission);
  return data;
};
async function verified(data: FormData) {
  const challenge = await requestStaffChangeCodeAction();
  expect(challenge.ok).toBe(true);
  data.set("challenge", challenge.challenge!);
  data.set("code", state.code);
  return data;
}

beforeAll(async () => {
  await db.user.createMany({
    data: [
      {
        id: adminId,
        name: "مدير تجربة",
        email: `${adminId}@example.invalid`,
        passwordHash: "x",
        city: "الرياض",
        role: "ADMIN",
      },
      {
        id: normalId,
        name: "مستخدم تجربة",
        email: `${normalId}@example.invalid`,
        passwordHash: "x",
        city: "الرياض",
      },
    ],
  });
  state.actor = adminId;
});
afterAll(async () => {
  if (employeeId) await db.user.deleteMany({ where: { id: employeeId } });
  await db.user.deleteMany({ where: { id: { in: [adminId, normalId] } } });
  await db.auditLog.deleteMany({
    where: { actorId: { in: [adminId, employeeId].filter(Boolean) } },
  });
});

describe("employee grants and revocation", () => {
  it("creates a passwordless employee by email with only selected permissions", async () => {
    const data = form({ name: "موظف تجربة", email: `${mark}@example.invalid`, role: "STAFF" }, [
      "users.view",
    ]);
    expect((await createStaffAction(data)).ok).toBe(false);
    expect((await createStaffAction(await verified(data))).ok).toBe(true);
    const employee = await db.user.findUniqueOrThrow({
      where: { email: `${mark}@example.invalid` },
    });
    employeeId = employee.id;
    expect(employee.role).toBe("STAFF");
    expect(employee.passwordEnabled).toBe(false);
    expect(parseStaffPermissions(employee.staffPermissions)).toEqual(["users.view"]);
    expect(sendLoginCodeEmail).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      "ADMIN_STAFF_CHANGE",
    );
    expect(sendEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({
        to: employee.email,
        subject: expect.stringContaining("موظف بصلاحيات مخصّصة"),
        html: expect.stringContaining(employee.name),
      }),
    );
  });

  it("denies a direct write call without the grant", async () => {
    state.actor = employeeId;
    await expect(toggleBanAction(form({ userId: normalId }))).rejects.toThrow("FORBIDDEN");
    await expect(adjustUserPointsAction(form({ userId: normalId, delta: "100" }))).rejects.toThrow(
      "FORBIDDEN",
    );
    expect((await db.user.findUniqueOrThrow({ where: { id: normalId } })).isBanned).toBe(false);
    state.actor = adminId;
  });

  it("grants one action, invalidates sessions, then revokes it", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: employeeId } });
    expect(
      (
        await updateStaffPermissionsAction(
          await verified(form({ userId: employeeId }, ["users.manage"])),
        )
      ).ok,
    ).toBe(true);
    const granted = await db.user.findUniqueOrThrow({ where: { id: employeeId } });
    expect(granted.sessionVersion).toBe(before.sessionVersion + 1);
    expect(parseStaffPermissions(granted.staffPermissions)).toEqual(["users.view", "users.manage"]);
    state.actor = employeeId;
    expect((await toggleBanAction(form({ userId: normalId }))).ok).toBe(true);
    state.actor = adminId;
    expect(
      (
        await updateStaffPermissionsAction(
          await verified(form({ userId: employeeId }, ["users.view"])),
        )
      ).ok,
    ).toBe(true);
    state.actor = employeeId;
    await expect(toggleBanAction(form({ userId: normalId }))).rejects.toThrow("FORBIDDEN");
    state.actor = adminId;
  });

  it("rejects an unknown grant and cannot customize an administrator", async () => {
    expect(
      (await updateStaffPermissionsAction(form({ userId: employeeId }, ["staff.manage"]))).ok,
    ).toBe(false);
    expect(
      (
        await updateStaffPermissionsAction(
          await verified(form({ userId: adminId }, ["users.view"])),
        )
      ).ok,
    ).toBe(false);
  });

  it("invites a promoted administrator by the stored name and role, and resends the current role", async () => {
    await db.user.update({ where: { id: normalId }, data: { isBanned: false } });
    const person = await db.user.findUniqueOrThrow({ where: { id: normalId } });
    const promoted = await createStaffAction(
      await verified(form({ name: "اسم النموذج", email: person.email, role: "ADMIN" })),
    );
    expect(promoted.ok).toBe(true);
    expect(sendEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({
        to: person.email,
        subject: expect.stringContaining("مدير"),
        html: expect.stringContaining(person.name),
      }),
    );
    expect(
      (await updateStaffRoleAction(await verified(form({ userId: normalId, role: "SUPPORT" })))).ok,
    ).toBe(true);
    expect((await resendStaffInviteAction(form({ userId: normalId }))).ok).toBe(true);
    expect(sendEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("دعم فني"),
      }),
    );
  });
});
