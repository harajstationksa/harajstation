"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { AdminActionForm } from "./AdminActionForm";
import { StaffPermissionGrid } from "./StaffPermissionGrid";
import { STAFF_ROLE_DESCRIPTIONS } from "@/lib/email-templates";
import { ROLE_LABELS } from "@/lib/constants";
import { createStaffAction, requestStaffChangeCodeAction } from "@/app/admin/actions";

export function StaffCreateForm() {
  const [role, setRole] = useState("STAFF");
  return (
    <AdminActionForm
      action={createStaffAction}
      stepUpAction={requestStaffChangeCodeAction}
      className="admin-form-card card p-5 sm:p-6 space-y-5"
      confirm={
        role === "ADMIN"
          ? "سيحصل هذا الحساب على جميع صلاحيات المدير. هل تأكدت من البريد والشخص؟"
          : undefined
      }
    >
      <div>
        <h2 className="font-bold flex items-center gap-2 text-lg">
          <UserPlus className="size-5 text-primary-500" /> إضافة عضو للفريق
        </h2>
        <p className="text-xs text-neutral-500 mt-1">
          تصله دعوة باسمه ورتبته الفعلية مع إرشادات الدخول المناسبة لحسابه.
        </p>
      </div>
      <div className="grid sm:grid-cols-3 gap-5 sm:gap-3">
        <label className="block text-sm font-medium">
          الاسم
          <input
            name="name"
            className="input mt-1.5"
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
          />
        </label>
        <label className="block text-sm font-medium">
          البريد الإلكتروني
          <input
            name="email"
            className="input mt-1.5"
            dir="ltr"
            type="email"
            required
            autoComplete="email"
          />
        </label>
        <label className="block text-sm font-medium">
          الرتبة الوظيفية
          <select
            name="role"
            className="input mt-1.5"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            {["STAFF", "MODERATOR", "SUPPORT", "ACCOUNTANT", "ADMIN"].map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-sm font-bold">الدعوة ستذكر الرتبة: {ROLE_LABELS[role]}</p>
        <p className="text-xs text-neutral-500 mt-1">{STAFF_ROLE_DESCRIPTIONS[role]}</p>
      </div>
      {role === "STAFF" ? (
        <StaffPermissionGrid />
      ) : (
        <p className="rounded-xl bg-amber-50 text-amber-900 text-xs p-3">
          هذا دور ثابت بصلاحياته المعتادة. اختر «موظف بصلاحيات مخصّصة» لتحديد الأقسام والإجراءات
          واحدًا واحدًا.
        </p>
      )}
      <p className="text-xs text-neutral-500">
        إذا كان البريد لحساب مستخدم موجود، سيتحول إلى موظف وتتوقف جلساته ودخوله العادي للموقع.
      </p>
      <button className="btn-primary">تأكيد بالبريد وإضافة عضو الفريق</button>
    </AdminActionForm>
  );
}
