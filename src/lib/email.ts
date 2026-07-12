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
  // official mailboxes: noreply@ sends, replies are routed to support@
  const from = process.env.MAIL_FROM ?? "حراج ستيشن <noreply@harajstation.com>";
  const replyTo = process.env.MAIL_REPLY_TO ?? "support@harajstation.com";
  try {
    await transport.sendMail({
      from,
      replyTo,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
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
  <body style="margin:0;background:#f5f5f4;font-family:Tahoma,Arial,sans-serif;padding:32px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;text-align:right;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
          <!-- brand header -->
          <tr>
            <td style="background:linear-gradient(135deg,#f97316,#ea580c);background-color:#f97316;padding:22px 32px">
              <span style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:0.5px">حراج ستيشن</span>
              <span style="font-size:11px;color:#ffedd5;display:block;padding-top:2px">منصة الإعلانات المبوبة والمزادات السعودية</span>
            </td>
          </tr>
          <!-- body -->
          <tr>
            <td style="padding:28px 32px 8px">
              <p style="margin:0 0 10px;font-size:18px;font-weight:bold;color:#171717">${title}</p>
              <div style="font-size:14px;color:#525252;line-height:1.9">${body}</div>
            </td>
          </tr>
          <!-- footer -->
          <tr>
            <td style="padding:20px 32px 28px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="border-top:1px solid #f0f0ef;padding-top:16px;font-size:11px;color:#a3a3a3;line-height:1.9">
                  وصلتك هذه الرسالة لأن بريدك مسجّل في حراج ستيشن — إذا لم تطلبها فتجاهلها بأمان.<br/>
                  للمساعدة راسل فريق الدعم:
                  <a href="mailto:support@harajstation.com" style="color:#f97316;text-decoration:none" dir="ltr">support@harajstation.com</a>
                  <br/>© ${new Date().getFullYear()} حراج ستيشن — harajstation.com
                </td></tr>
              </table>
            </td>
          </tr>
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
