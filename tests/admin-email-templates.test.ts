import { describe, expect, it } from "vitest";
import { otpEmailTemplate, staffInviteTemplate, type OtpEmailPurpose } from "@/lib/email-templates";
import { ROLE_LABELS } from "@/lib/constants";

describe("purpose-specific verification mail", () => {
  it.each([
    ["SITE_LOGIN", "تسجيل الدخول"],
    ["ADMIN_LOGIN", "الدخول إلى لوحة الإدارة"],
    ["ADMIN_STAFF_CHANGE", "إدارة الفريق والصلاحيات"],
    ["ADMIN_STEPUP", "تعديل حسابك الإداري"],
    ["ADMIN_EMAIL_CHANGE", "البريد الجديد"],
    ["ADMIN_RESET", "استعادة الحساب الإداري"],
    ["ACCOUNT_DELETE", "حذف الحساب"],
    ["ACCOUNT_EMAIL_CHANGE", "تغيير البريد"],
    ["ACCOUNT_2FA", "التحقق بخطوتين"],
  ] as [OtpEmailPurpose, string][])("%s explains the actual operation", (purpose, title) => {
    const mail = otpEmailTemplate("123456", purpose);
    expect(mail.subject).toContain(title);
    expect(mail.html).toContain("123456");
    expect(mail.text).toContain("10 دقائق ولمرة واحدة");
    expect(mail.html).toContain('dir="rtl"');
    // An inbox preview must not expose the verification code in the subject.
    expect(mail.subject).not.toContain("123456");
  });
  it("does not describe a staff change as signing in", () => {
    const mail = otpEmailTemplate("123456", "ADMIN_STAFF_CHANGE");
    expect(mail.subject).not.toContain("تسجيل الدخول");
    expect(mail.text).toContain("هذا الرمز لا يسجل دخولك");
  });
  it("rejects unexpected code content", () => {
    expect(() => otpEmailTemplate('<img src="x">')).toThrow();
  });
});

describe("staff invitation emails", () => {
  it.each(["ADMIN", "MODERATOR", "SUPPORT", "ACCOUNTANT", "STAFF"])(
    "names the actual %s role",
    (role) => {
      const mail = staffInviteTemplate(
        { name: "عضو تجربة", role, passwordEnabled: false },
        "https://haraj-ad.harajstation.com/admin-login",
      );
      expect(mail.subject).toContain(ROLE_LABELS[role]);
      expect(mail.html).toContain(ROLE_LABELS[role]);
      expect(mail.text).toContain(`برتبة: ${ROLE_LABELS[role]}`);
      expect(mail.text).toContain("حسابك لا يحتاج إلى كلمة مرور");
      expect(mail.html).toContain('href="https://haraj-ad.harajstation.com/admin-login"');
      if (role !== "STAFF") expect(mail.html).not.toContain("حساب موظف");
    },
  );
  it("gives existing password accounts accurate login instructions and escapes names", () => {
    const mail = staffInviteTemplate(
      { name: '<img src=x onerror="alert(1)">', role: "ADMIN", passwordEnabled: true },
      "https://haraj-ad.harajstation.com/admin-login",
    );
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img");
    expect(mail.text).toContain("كلمة المرور الحالية");
    expect(mail.text).not.toContain("لا يحتاج إلى كلمة مرور");
  });
  it("rejects public user roles and executable invitation links", () => {
    const user = { name: "تجربة", role: "USER", passwordEnabled: false };
    expect(() => staffInviteTemplate(user, "https://example.com/admin-login")).toThrow();
    expect(() => staffInviteTemplate({ ...user, role: "ADMIN" }, "javascript:alert(1)")).toThrow();
    expect(() => staffInviteTemplate({ ...user, role: "ADMIN" }, "/admin-login")).toThrow();
  });
});
