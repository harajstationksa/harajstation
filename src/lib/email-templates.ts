import { ROLE_LABELS } from "./constants";

export type OtpEmailPurpose =
  | "ACCOUNT_DELETE"
  | "ACCOUNT_EMAIL_CHANGE"
  | "ACCOUNT_2FA"
  | "SITE_LOGIN"
  | "ADMIN_LOGIN"
  | "ADMIN_STEPUP"
  | "ADMIN_STAFF_CHANGE"
  | "ADMIN_EMAIL_CHANGE"
  | "ADMIN_RESET";

export function escapeEmailHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
}

/** Table layout and inline styles also work in mail clients without CSS support. */
export function emailShell(title: string, body: string, preview = title) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f3f5f7;padding:28px 12px;font-family:Tahoma,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeEmailHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#fff;border:1px solid #e4e8ed;border-radius:20px;overflow:hidden;text-align:right">
<tr><td style="padding:26px 28px;background:#17242d;border-bottom:4px solid #db7759"><span style="font-size:23px;font-weight:bold;color:#fff">حراج ستيشن</span><div style="font-size:12px;color:#c4ced5;margin-top:7px">منصة الإعلانات والمزادات السعودية</div></td></tr>
<tr><td style="padding:28px;color:#46545e;font-size:14px;line-height:1.9"><h1 style="font-size:21px;color:#17242d;margin:0 0 18px">${escapeEmailHtml(title)}</h1>${body}</td></tr>
<tr><td style="padding:20px 28px;background:#f8fafb;border-top:1px solid #e9edf0;color:#6b7780;font-size:11px;line-height:1.9">رسالة آلية من حراج ستيشن. لا تشارك رموز التحقق مع أي شخص.<br>للمساعدة: <a href="mailto:support@harajstation.com" dir="ltr" style="color:#b7573b">support@harajstation.com</a><br>© ${new Date().getFullYear()} حراج ستيشن</td></tr>
</table></td></tr></table></body></html>`;
}

const OTP_COPY: Record<OtpEmailPurpose, { title: string; description: string }> = {
  SITE_LOGIN: {
    title: "رمز تسجيل الدخول",
    description: "استخدم هذا الرمز لإتمام تسجيل الدخول إلى حسابك في حراج ستيشن.",
  },
  ADMIN_LOGIN: {
    title: "رمز الدخول إلى لوحة الإدارة",
    description: "استخدم هذا الرمز لإتمام تسجيل الدخول إلى لوحة إدارة حراج ستيشن.",
  },
  ADMIN_STAFF_CHANGE: {
    title: "تأكيد إدارة الفريق والصلاحيات",
    description:
      "طلبت إجراءً لإضافة عضو إلى فريق الإدارة أو تعديل رتبته أو صلاحياته أو إزالتها. أدخل الرمز في نموذج الإجراء الذي فتحته لتأكيده. هذا الرمز لا يسجل دخولك.",
  },
  ADMIN_STEPUP: {
    title: "تأكيد تعديل حسابك الإداري",
    description: "استخدم هذا الرمز لتأكيد تعديل بيانات حسابك الإداري أو كلمة المرور من صفحة حسابي.",
  },
  ADMIN_EMAIL_CHANGE: {
    title: "تأكيد البريد الجديد لحسابك الإداري",
    description:
      "استخدم هذا الرمز لإثبات ملكية هذا البريد واعتماده لحسابك الإداري. بريد الحساب الحالي لا يتغير قبل إتمام التأكيد.",
  },
  ADMIN_RESET: {
    title: "تأكيد استعادة الحساب الإداري",
    description: "استخدم هذا الرمز لإتمام طلب استعادة حسابك الإداري وتعيين كلمة مرور جديدة.",
  },
  ACCOUNT_DELETE: {
    title: "تأكيد حذف الحساب",
    description: "طلبت حذف حسابك في حراج ستيشن. أدخل هذا الرمز في صفحة حذف الحساب لتأكيد الطلب.",
  },
  ACCOUNT_EMAIL_CHANGE: {
    title: "تأكيد تغيير البريد الإلكتروني",
    description: "استخدم هذا الرمز لتأكيد طلب تغيير البريد الإلكتروني لحسابك في حراج ستيشن.",
  },
  ACCOUNT_2FA: {
    title: "تأكيد إعدادات التحقق بخطوتين",
    description: "استخدم هذا الرمز لتأكيد تغيير إعدادات التحقق بخطوتين لحسابك.",
  },
};

export function otpEmailTemplate(code: string, purpose: OtpEmailPurpose = "SITE_LOGIN") {
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid email verification code");
  const copy = OTP_COPY[purpose];
  const warning =
    "إذا لم تطلب هذا الإجراء، لا تستخدم الرمز وتواصل مع الدعم إذا لاحظت نشاطًا غير معتاد.";
  return {
    subject: `${copy.title} | حراج ستيشن`,
    text: `${copy.title}\n\n${copy.description}\n\nالرمز: ${code}\nصالح لمدة 10 دقائق ولمرة واحدة.\n\n${warning}\nلا تشارك الرمز مع أي شخص.`,
    html: emailShell(
      copy.title,
      `<p>${copy.description}</p><div style="text-align:center;margin:24px 0"><span dir="ltr" style="display:inline-block;background:#faf0eb;border:1px solid #efd5ca;color:#a8492f;padding:16px 26px;border-radius:14px;font-size:32px;font-weight:bold;letter-spacing:8px">${code}</span><p style="font-size:12px;color:#78848d">صالح لمدة 10 دقائق ولمرة واحدة</p></div><p style="padding:14px;background:#f6f8fa;border-radius:12px;font-size:12px">${warning}<br>لا تشارك الرمز مع أي شخص، حتى من يدّعي أنه من فريق حراج ستيشن.</p>`,
    ),
  };
}

export const STAFF_ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: "إدارة المنصة والفريق والإعدادات بجميع صلاحيات المدير.",
  MODERATOR: "مراجعة الإعلانات والمستخدمين والمزايدات والبلاغات وطلبات التوثيق والحملات.",
  SUPPORT: "متابعة المستخدمين والنزاعات والبلاغات ومعاملات البيع ودعم المجتمع.",
  ACCOUNTANT: "عرض التقارير المالية وتصديرها ومراجعة المدفوعات وحركة النقاط.",
  STAFF: "الوصول إلى الأقسام والإجراءات التي يحددها المدير لهذا الحساب فقط.",
};

export function staffInviteTemplate(
  user: { name: string; role: string; passwordEnabled: boolean },
  portal: string,
) {
  if (!Object.hasOwn(STAFF_ROLE_DESCRIPTIONS, user.role))
    throw new Error("Invalid staff email role");
  const url = new URL(portal);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid admin portal URL");
  const role = ROLE_LABELS[user.role];
  const title = `دعوتك إلى فريق حراج ستيشن — ${role}`;
  const login = user.passwordEnabled
    ? "استخدم كلمة المرور الحالية لحسابك، ثم رمز التحقق المرسل إلى بريدك لإتمام الدخول."
    : "حسابك لا يحتاج إلى كلمة مرور حاليًا. أدخل بريدك في بوابة الإدارة واطلب رمز الدخول. يمكنك تفعيل كلمة مرور لاحقًا من صفحة حسابي.";
  return {
    subject: title,
    text: `أهلًا ${user.name}\nتمت إضافتك إلى فريق حراج ستيشن برتبة: ${role}.\n${STAFF_ROLE_DESCRIPTIONS[user.role]}\n\n${login}\nبوابة الإدارة: ${url.href}\nرمز بريد مطلوب في كل دخول. إذا لم تتوقع هذه الدعوة، تواصل مع الدعم.`,
    html: emailShell(
      title,
      `<p>أهلًا <strong>${escapeEmailHtml(user.name)}</strong>،</p><p>تمت إضافتك إلى فريق حراج ستيشن برتبة:</p><div style="padding:18px;background:#faf0eb;border:1px solid #efd5ca;border-radius:14px"><strong style="font-size:19px;color:#a8492f">${escapeEmailHtml(role)}</strong><p style="margin:6px 0 0;font-size:13px">${STAFF_ROLE_DESCRIPTIONS[user.role]}</p></div><p>${login}</p><div style="padding:16px 0;text-align:center"><a href="${escapeEmailHtml(url.href)}" style="display:inline-block;background:#db7759;color:#fff;text-decoration:none;border-radius:12px;padding:13px 26px;font-weight:bold">الدخول إلى لوحة الإدارة</a></div><p style="font-size:12px">رمز بريد مطلوب في كل دخول. إذا لم تتوقع هذه الدعوة، تواصل مع الدعم.</p>`,
    ),
  };
}
