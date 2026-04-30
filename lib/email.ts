import nodemailer, { type Transporter } from "nodemailer";
import {
  buildGoogleCalendarUrl,
  buildIcsDownloadUrl,
  buildOutlookCalendarUrl,
  type CalendarEvent,
} from "./calendar";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ id?: string }>;
}

class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<{ id?: string }> {
     
    console.info("[email:console]", JSON.stringify(message, null, 2));
    return { id: "console" };
  }
}

class GmailEmailProvider implements EmailProvider {
  private transporter: Transporter;
  private from: string;

  constructor(user: string, appPassword: string, from: string) {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass: appPassword },
    });
    this.from = from;
  }

  async send(message: EmailMessage): Promise<{ id?: string }> {
    const result = await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { id: result.messageId };
  }
}

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  // Env var names match what's configured in Vercel: `gmail` (login) and
  // `apppassword` (Google App Password). Uppercase fallbacks are accepted
  // for local dev convenience.
  const user = process.env.gmail ?? process.env.GMAIL_USER;
  const appPassword = process.env.apppassword ?? process.env.GMAIL_APP_PASSWORD;
  const from = process.env.EMAIL_FROM ?? (user ? `Coach J <${user}>` : "Coach J <bookings@example.com>");
  cached =
    user && appPassword
      ? new GmailEmailProvider(user, appPassword, from)
      : new ConsoleEmailProvider();
  return cached;
}

/** Reset for tests / DI. */
export function setEmailProvider(provider: EmailProvider | null): void {
  cached = provider;
}

// ---------- HTML email templates ----------

function emailShell(title: string, bannerColor: string, bannerContent: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background-color:#18181b;padding:20px 32px;text-align:center;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Coach J</span>
          </td>
        </tr>
        <tr>
          <td style="background-color:${bannerColor};padding:24px 32px;text-align:center;">
            ${bannerContent}
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${bodyContent}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 28px;border-top:1px solid #e4e4e7;text-align:center;">
            <p style="margin:0 0 6px;color:#a1a1aa;font-size:13px;">— Coach J</p>
            <p style="margin:0;color:#a1a1aa;font-size:12px;">Please do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function sessionDetailsCard(sessionName: string, dateLabel: string, slotTime: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f9f9fb;border-radius:8px;border:1px solid #e4e4e7;margin-top:24px;">
      <tr><td style="padding:20px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;">
              <span style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Session</span><br>
              <span style="color:#18181b;font-size:16px;font-weight:600;">${sessionName}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;">
              <span style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Date</span><br>
              <span style="color:#18181b;font-size:16px;font-weight:600;">${dateLabel}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;">
              <span style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Time</span><br>
              <span style="color:#18181b;font-size:16px;font-weight:600;">${slotTime}</span>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>`;
}

/**
 * Resolve the public base URL used to build absolute add-to-calendar links
 * (specifically the Apple `.ics` download endpoint). Falls back to Vercel's
 * deployment URL, then null when neither is configured — in which case the
 * calendar buttons are omitted entirely.
 */
function getPublicBaseUrl(): string | null {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit && explicit.length > 0) return explicit;
  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.length > 0) return `https://${vercel}`;
  return null;
}

/**
 * HTML block matching the "add to calendar | Apple · Google · Outlook" row in
 * the issue's reference email. Returns an empty string when no calendar event
 * is supplied or no public base URL is configured (Apple link needs an
 * absolute URL to our `.ics` endpoint).
 */
function calendarButtonsHtmlBlock(event: CalendarEvent | null): string {
  if (!event) return "";
  const baseUrl = getPublicBaseUrl();
  if (!baseUrl) return "";
  const apple = buildIcsDownloadUrl(baseUrl, event);
  const google = buildGoogleCalendarUrl(event);
  const outlook = buildOutlookCalendarUrl(event);
  const linkStyle =
    "display:inline-block;padding:0 14px;color:#2563eb;font-size:14px;font-weight:600;text-decoration:none;";
  const sepStyle = "color:#d4d4d8;";
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px;">
      <tr><td align="center" style="padding:6px 0 10px;color:#71717a;font-size:13px;">add to calendar</td></tr>
      <tr><td align="center">
        <a href="${apple}" style="${linkStyle}">Apple</a><span style="${sepStyle}">·</span><a href="${google}" style="${linkStyle}">Google</a><span style="${sepStyle}">·</span><a href="${outlook}" style="${linkStyle}">Outlook</a>
      </td></tr>
    </table>`;
}

/** Plain-text counterpart of `calendarButtonsHtmlBlock` for the text body. */
function calendarLinksTextLines(event: CalendarEvent | null): string[] {
  if (!event) return [];
  const baseUrl = getPublicBaseUrl();
  if (!baseUrl) return [];
  return [
    ``,
    `Add to calendar:`,
    `  Apple:   ${buildIcsDownloadUrl(baseUrl, event)}`,
    `  Google:  ${buildGoogleCalendarUrl(event)}`,
    `  Outlook: ${buildOutlookCalendarUrl(event)}`,
  ];
}

function buildBookingConfirmationHtml(
  status: "Confirmed" | "Waitlist",
  sessionName: string,
  dateLabel: string,
  slotTime: string,
  position?: number,
  calendarEvent?: CalendarEvent | null,
): string {
  if (status === "Confirmed") {
    const banner = `<span style="color:#ffffff;font-size:22px;font-weight:700;">✓ You're confirmed!</span>`;
    const body = `
      <p style="margin:0;color:#3f3f46;font-size:15px;line-height:1.6;">
        Your spot is confirmed. If you can no longer attend, please cancel as early as possible so someone on the waitlist can take your place.
      </p>
      ${sessionDetailsCard(sessionName, dateLabel, slotTime)}
      ${calendarButtonsHtmlBlock(calendarEvent ?? null)}`;
    return emailShell("Booking confirmed", "#22c55e", banner, body);
  } else {
    const positionNote = position
      ? `<p style="margin:12px 0 0;color:#92400e;font-size:14px;font-weight:600;">You are <strong>#${position}</strong> on the waitlist.</p>`
      : "";
    const banner = `<span style="color:#ffffff;font-size:22px;font-weight:700;">⏳ You're on the waitlist</span>`;
    const body = `
      <p style="margin:0;color:#3f3f46;font-size:15px;line-height:1.6;">
        The slot is currently full, so you've been added to the waitlist. If a spot opens up, you'll be moved up automatically and we'll send you another email.
      </p>
      ${positionNote}
      ${sessionDetailsCard(sessionName, dateLabel, slotTime)}`;
    return emailShell("You're on the waitlist", "#f59e0b", banner, body);
  }
}

function buildCancellationHtml(
  sessionName: string,
  dateLabel: string,
  slotTime: string,
  byAdmin: boolean,
): string {
  const banner = `<span style="color:#ffffff;font-size:22px;font-weight:700;">👋 Sorry to see you go</span>`;
  const intro = byAdmin
    ? `Your booking has been cancelled by admin. Please do not reply to this email.`
    : `Your booking has been cancelled. Sorry to see you go — hope to see you again at a future session! Please do not reply to this email.`;
  const body = `
    <p style="margin:0;color:#3f3f46;font-size:15px;line-height:1.6;">
      ${intro}
    </p>
    ${sessionDetailsCard(sessionName, dateLabel, slotTime)}`;
  return emailShell("Booking cancelled", "#ef4444", banner, body);
}

function buildPromotionHtml(
  sessionName: string,
  dateLabel: string,
  slotTime: string,
  calendarEvent?: CalendarEvent | null,
): string {
  const banner = `<span style="color:#ffffff;font-size:22px;font-weight:700;">🎉 You're in — spot confirmed!</span>`;
  const body = `
    <p style="margin:0;color:#3f3f46;font-size:15px;line-height:1.6;">
      Great news — a spot opened up and you've been moved from the waitlist. Your place is now confirmed!
    </p>
    ${sessionDetailsCard(sessionName, dateLabel, slotTime)}
    ${calendarButtonsHtmlBlock(calendarEvent ?? null)}`;
  return emailShell("You're in — spot confirmed!", "#0ea5e9", banner, body);
}

// ---------- Public send functions ----------

export async function sendBookingConfirmationEmail(
  to: string,
  status: "Confirmed" | "Waitlist",
  slotTime: string,
  dateLabel: string,
  sessionName: string,
  position?: number,
  calendarEvent?: CalendarEvent | null,
) {
  const provider = getEmailProvider();
  const subject =
    status === "Confirmed"
      ? `Booking confirmed — ${sessionName} (${dateLabel} ${slotTime})`
      : `You're on the waitlist — ${sessionName} (${dateLabel} ${slotTime})`;
  // Calendar links only make sense for confirmed bookings — waitlisted users
  // don't have a guaranteed event yet, so we skip add-to-calendar there.
  const eventForLinks = status === "Confirmed" ? calendarEvent ?? null : null;
  const lines =
    status === "Confirmed"
      ? [
          `Thanks for booking — your spot is confirmed.`,
          ``,
          `Session: ${sessionName}`,
          `Date: ${dateLabel}`,
          `Time: ${slotTime}`,
          ...calendarLinksTextLines(eventForLinks),
          ``,
          `If you can no longer attend, please cancel as early as possible so someone on the waitlist can take your place.`,
          ``,
          `See you there!`,
          `— Coach J`,
          ``,
          `Please do not reply to this email.`,
        ]
      : [
          `Thanks for signing up — the slot is currently full, so you've been added to the waitlist.`,
          ``,
          `Session: ${sessionName}`,
          `Date: ${dateLabel}`,
          `Time: ${slotTime}`,
          ...(position ? [`Waitlist position: ${position}`] : []),
          ``,
          `If a spot opens up, you'll be promoted automatically and we'll send you another email.`,
          ``,
          `— Coach J`,
          ``,
          `Please do not reply to this email.`,
        ];
  const html = buildBookingConfirmationHtml(status, sessionName, dateLabel, slotTime, position, eventForLinks);
  return provider.send({ to, subject, text: lines.join("\n"), html });
}

export async function sendPromotionEmail(
  to: string,
  slotTime: string,
  dateLabel: string,
  sessionName: string,
  calendarEvent?: CalendarEvent | null,
) {
  const provider = getEmailProvider();
  const subject = `You're in — spot confirmed! ${sessionName} (${dateLabel} ${slotTime})`;
  const text = [
    `Great news — a spot opened up and you've been moved from the waitlist. Your place is now confirmed!`,
    ``,
    `Session: ${sessionName}`,
    `Date: ${dateLabel}`,
    `Time: ${slotTime}`,
    ...calendarLinksTextLines(calendarEvent ?? null),
    ``,
    `See you there!`,
    `— Coach J`,
    ``,
    `Please do not reply to this email.`,
  ].join("\n");
  const html = buildPromotionHtml(sessionName, dateLabel, slotTime, calendarEvent ?? null);
  return provider.send({ to, subject, text, html });
}

export async function sendCancellationEmail(
  to: string,
  slotTime: string,
  dateLabel: string,
  sessionName: string,
  byAdmin: boolean,
) {
  const provider = getEmailProvider();
  const subject = `Booking cancelled — ${sessionName} (${dateLabel} ${slotTime})`;
  const lines = byAdmin
    ? [
        `Your booking has been cancelled by admin.`,
        ``,
        `Session: ${sessionName}`,
        `Date: ${dateLabel}`,
        `Time: ${slotTime}`,
        ``,
        `— Coach J`,
        ``,
        `Please do not reply to this email.`,
      ]
    : [
        `Your booking has been cancelled. Sorry to see you go — hope to see you again at a future session!`,
        ``,
        `Session: ${sessionName}`,
        `Date: ${dateLabel}`,
        `Time: ${slotTime}`,
        ``,
        `— Coach J`,
        ``,
        `Please do not reply to this email.`,
      ];
  const html = buildCancellationHtml(sessionName, dateLabel, slotTime, byAdmin);
  return provider.send({ to, subject, text: lines.join("\n"), html });
}
