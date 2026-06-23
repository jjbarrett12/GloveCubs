import nodemailer from "nodemailer";

/**
 * SMTP outbound mail (server-only). Mirrors repo root `lib/email.js` env contract.
 */
export function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

const fromAddress = () => process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@glovecubs.com";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

/**
 * Attempts to send an email. On missing SMTP, logs and returns { sent: false } (no throw).
 */
export async function sendSmtpMail(params: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const t = getTransporter();
  if (!t) {
    console.warn("[storefront/smtp] SMTP not configured; email skipped");
    return { sent: false, error: "SMTP not configured" };
  }
  try {
    await t.sendMail({
      from: fromAddress(),
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html ?? params.text.replace(/\n/g, "<br>"),
    });
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[storefront/smtp] send failed", msg);
    return { sent: false, error: msg };
  }
}

export function getAdminNotificationEmail(): string {
  return (process.env.ADMIN_EMAIL || process.env.SMTP_USER || "sales@glovecubs.com").trim();
}
