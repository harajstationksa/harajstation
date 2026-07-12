/**
 * Transactional email via SMTP (Brevo relay). Configured when the SMTP_*
 * variables are set; the sender (MAIL_FROM) must be on a domain verified
 * in the Brevo dashboard.
 */

import nodemailer, { type Transporter } from "nodemailer";

export function emailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!emailConfigured()) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 587 → STARTTLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) return false;
  const from = process.env.MAIL_FROM ?? "حراج ستيشن <no-reply@harajstation.com>";
  try {
    await transport.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html });
    return true;
  } catch (e) {
    console.error("smtp send failed:", e);
    return false;
  }
}

/** Shared RTL wrapper so every mail looks on-brand without a template system. */
function shell(title: string, body: string) {
  return `<!doctype html>
<html dir="rtl" lang="ar">
  <body style="margin:0;background:#f5f5f4;font-family:Tahoma,Arial,sans-serif;padding:24px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:16px;padding:32px;text-align:right">
          <tr><td style="font-size:22px;font-weight:bold;color:#f97316;padding-bottom:4px">حراج ستيشن</td></tr>
          <tr><td style="font-size:17px;font-weight:bold;color:#171717;padding:12px 0 4px">${title}</td></tr>
          <tr><td style="font-size:14px;color:#525252;line-height:1.9">${body}</td></tr>
          <tr><td style="font-size:11px;color:#a3a3a3;padding-top:24px;border-top:1px solid #f5f5f4;line-height:1.8">
            وصلتك هذه الرسالة لأن بريدك مسجّل في حراج ستيشن — إذا لم تطلبها فتجاهلها بأمان.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${site}${verifyUrl}`;
  return sendEmail({
    to,
    subject: "أكّد بريدك الإلكتروني — حراج ستيشن",
    html: shell(
      "أهلاً بك في حراج ستيشن 👋",
      `خطوة أخيرة: أكّد بريدك الإلكتروني بالضغط على الزر التالي — الرابط صالح لمدة 48 ساعة:
       <div style="padding:20px 0;text-align:center">
         <a href="${link}" style="background:#f97316;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:bold;display:inline-block">
           تأكيد البريد الإلكتروني
         </a>
       </div>
       أو انسخ الرابط التالي في المتصفح:<br/>
       <span dir="ltr" style="color:#737373;font-size:12px;word-break:break-all">${link}</span>`
    ),
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${site}${resetUrl}`;
  return sendEmail({
    to,
    subject: "إعادة تعيين كلمة المرور — حراج ستيشن",
    html: shell(
      "طلب إعادة تعيين كلمة المرور",
      `اضغط الزر التالي لتعيين كلمة مرور جديدة — الرابط صالح لمدة 30 دقيقة ولمرة واحدة:
       <div style="padding:20px 0;text-align:center">
         <a href="${link}" style="background:#f97316;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:bold;display:inline-block">
           إعادة تعيين كلمة المرور
         </a>
       </div>
       أو انسخ الرابط التالي في المتصفح:<br/>
       <span dir="ltr" style="color:#737373;font-size:12px;word-break:break-all">${link}</span>`
    ),
  });
}
