"use client";

import { useEffect } from "react";
import { useLang } from "./LangProvider";

/**
 * Localizes the browser's native form-validation bubbles ("Please fill out
 * this field.") to match the site language — the browser otherwise shows them
 * in the BROWSER's language, not the page's. One capture-phase listener
 * covers every form in the app; typing clears the message so revalidation
 * works normally.
 */
const MSG = {
  ar: {
    missing: "يرجى تعبئة هذا الحقل",
    missingCheck: "يجب تحديد هذا الخيار للمتابعة",
    email: "أدخل بريداً إلكترونياً صالحاً",
    tooShort: (n: number) => `أدخل ${n} أحرف على الأقل`,
    pattern: "القيمة المدخلة غير صالحة",
    number: "أدخل رقماً صالحاً",
    range: "القيمة خارج النطاق المسموح",
  },
  en: {
    missing: "Please fill out this field",
    missingCheck: "Please check this box to continue",
    email: "Enter a valid email address",
    tooShort: (n: number) => `Enter at least ${n} characters`,
    pattern: "The entered value is invalid",
    number: "Enter a valid number",
    range: "Value is out of the allowed range",
  },
};

export function NativeFormMessages() {
  const { lang } = useLang();

  useEffect(() => {
    const t = MSG[lang];

    function onInvalid(e: Event) {
      const el = e.target;
      if (
        !(el instanceof HTMLInputElement) &&
        !(el instanceof HTMLTextAreaElement) &&
        !(el instanceof HTMLSelectElement)
      ) {
        return;
      }
      const v = el.validity;
      if (v.customError) return; // a component set its own message
      let msg = "";
      if (v.valueMissing) {
        msg = el instanceof HTMLInputElement && el.type === "checkbox" ? t.missingCheck : t.missing;
      } else if (v.typeMismatch && el instanceof HTMLInputElement && el.type === "email") {
        msg = t.email;
      } else if (v.tooShort && "minLength" in el) {
        msg = t.tooShort(el.minLength);
      } else if (v.patternMismatch) {
        msg = t.pattern;
      } else if (v.badInput) {
        msg = t.number;
      } else if (v.rangeUnderflow || v.rangeOverflow || v.stepMismatch) {
        msg = t.range;
      }
      if (msg) el.setCustomValidity(msg);
    }

    function clear(e: Event) {
      const el = e.target;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        el.setCustomValidity("");
      }
    }

    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", clear, true);
    document.addEventListener("change", clear, true);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", clear, true);
      document.removeEventListener("change", clear, true);
    };
  }, [lang]);

  return null;
}
