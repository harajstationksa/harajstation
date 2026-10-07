/**
 * Transactional email via SMTP (Brevo relay). Configured when the SMTP_*
 * variables are set; the sender (MAIL_FROM) must be on a domain verified
 * in the Brevo dashboard.
 */

import nodemailer, { type Transporter } from "nodemailer";
import { isRateLimited } from "./rate-limit";
import { emailShell as shell, otpEmailTemplate, type OtpEmailPurpose } from "./email-templates";

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

/** Per-inbox ceiling: 5 mails/hour and 12/day, whatever the caller. */
async function mailBombGuard(to: string): Promise<boolean> {
  return (
    (await isRateLimited(`mail:h:${to}`, 5, 60 * 60_000)) ||
    (await isRateLimited(`mail:d:${to}`, 12, 24 * 3_600_000))
  );
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) return false;

  // Last line of defence against mail bombing: the routes are IP-limited, but
  // an attacker rotating IPs could still flood one inbox with verification /
  // reset mails. Cap it here, at the single point every mail passes through.
  const to = opts.to.toLowerCase().trim();
  if (await mailBombGuard(to)) {
    console.warn("email_suppressed_recipient_quota");
    return false;
  }

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
      text: opts.text,
    });
    return true;
  } catch {
    console.error("smtp_send_failed");
    return false;
  }
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
       <span dir="ltr" style="color:#737373;font-size:12px;word-break:break-all">${link}</span>`,
    ),
  });
}

export async function sendLoginCodeEmail(
  to: string,
  code: string,
  purpose: OtpEmailPurpose = "SITE_LOGIN",
) {
  return sendEmail({ to, ...otpEmailTemplate(code, purpose) });
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
       <span dir="ltr" style="color:#737373;font-size:12px;word-break:break-all">${link}</span>`,
    ),
  });
}
