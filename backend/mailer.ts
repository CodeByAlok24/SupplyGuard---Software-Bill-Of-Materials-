import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST || "smtp.gmail.com";
const port = Number(process.env.SMTP_PORT || 465);
const user = process.env.SMTP_USER || "";
const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");
const from = process.env.SMTP_FROM || (user ? `SupplyGuard <${user}>` : "");

export const smtpConfigured = Boolean(user && pass);

const transport = smtpConfigured
  ? nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })
  : null;

if (smtpConfigured) {
  transport!.verify().then(
    () => console.log(`SMTP configured: ${user} (${host}:${port})`),
    (error: unknown) => console.error("SMTP verification failed:", error instanceof Error ? error.message : error),
  );
} else {
  console.log("SMTP not configured: password reset and invite emails are disabled.");
}

type MailInput = { to: string; subject: string; text: string; html?: string };

export async function sendMail({ to, subject, text, html }: MailInput) {
  if (!transport) throw new Error("SMTP is not configured. Set SMTP_USER and SMTP_PASS in server/.env.");
  const info = await transport.sendMail({ from, to, subject, text, html });
  return { messageId: info.messageId };
}
