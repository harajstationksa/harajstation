"use client";

import { useState } from "react";
import { AdminActionForm } from "./AdminActionForm";
import { reviewExistingListingAction, reviewListingAction } from "@/app/admin/actions";

type Decision = "approve" | "request_info" | "reject" | "hold" | "mark_reviewed";

export function AdminReviewForm({
  listingId,
  mode,
  decision,
  riskLevel,
  isAdmin,
  disabled = false,
  suggestions = [],
}: {
  listingId: string;
  mode: "pending" | "existing";
  decision: Decision;
  riskLevel: string;
  isAdmin: boolean;
  disabled?: boolean;
  suggestions?: Array<{ label: string; text: string }>;
}) {
  const [note, setNote] = useState("");
  const clearProhibited =
    riskLevel === "PROHIBITED" && (decision === "approve" || decision === "mark_reviewed");
  const blocked = disabled || (clearProhibited && !isAdmin);
  const labels: Record<Decision, string> = {
    approve: "اعتماد ونشر",
    request_info: "طلب معلومات",
    reject: "رفض الإعلان",
    hold: "نقل إلى المراجعة",
    mark_reviewed: "تم التحقق، اتركه منشورًا",
  };
  const confirm =
    decision === "reject"
      ? "سيُوقف الإعلان ويُبلّغ البائع. متابعة؟"
      : decision === "hold"
        ? "سيختفي الإعلان مؤقتًا إلى حين انتهاء المراجعة. متابعة؟"
        : clearProhibited
          ? "تأكدت بنفسك من سبب تجاوز إشارة المحتوى المحظور؟"
          : undefined;

  return (
    <AdminActionForm
      action={mode === "pending" ? reviewListingAction : reviewExistingListingAction}
      className="card p-4 space-y-3"
      confirm={confirm}
    >
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="decision" value={decision} />
      <strong className="block text-sm">{labels[decision]}</strong>
      {decision === "request_info" && suggestions.length > 0 && (
        <label className="block text-xs space-y-1">
          رسالة مقترحة
          <select
            className="input w-full text-xs"
            defaultValue=""
            onChange={(event) => setNote(event.target.value)}
          >
            <option value="">اختر رسالة جاهزة أو اكتب بنفسك</option>
            {suggestions.map((item) => (
              <option key={item.label} value={item.text}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-xs space-y-1">
        سبب القرار أو المعلومات المطلوبة
        <textarea
          name="note"
          required
          minLength={clearProhibited ? 30 : 10}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="input w-full min-h-24"
          placeholder={
            decision === "request_info"
              ? "ما المعلومات المطلوبة من البائع؟"
              : decision === "approve" || decision === "mark_reviewed"
                ? "اذكر ما تحققت منه وسبب القرار"
                : "اكتب سببًا واضحًا للقرار"
          }
        />
      </label>
      {clearProhibited && isAdmin && (
        <label className="flex items-start gap-2 text-xs text-red-800">
          <input type="checkbox" name="overrideProhibited" value="yes" required />
          <span>راجعت الإشارة المحظورة يدويًا، ودوّنت سبب القرار بالتفصيل.</span>
        </label>
      )}
      {blocked && clearProhibited && !isAdmin && (
        <p className="text-xs text-red-700">هذا القرار يتطلب مدير النظام.</p>
      )}
      <button
        disabled={blocked}
        className={
          decision === "approve" || decision === "mark_reviewed"
            ? "btn-primary disabled:opacity-40"
            : "btn-secondary disabled:opacity-40"
        }
      >
        {labels[decision]}
      </button>
    </AdminActionForm>
  );
}
