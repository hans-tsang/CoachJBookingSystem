import { Resend } from "resend";

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

class ResendEmailProvider implements EmailProvider {
  private client: Resend;
  private from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(message: EmailMessage): Promise<{ id?: string }> {
    const result = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }
    return { id: result.data?.id };
  }
}

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Coach J <bookings@example.com>";
  cached = apiKey ? new ResendEmailProvider(apiKey, from) : new ConsoleEmailProvider();
  return cached;
}

/** Reset for tests / DI. */
export function setEmailProvider(provider: EmailProvider | null): void {
  cached = provider;
}

export async function sendBookingConfirmationEmail(
  to: string,
  status: "Confirmed" | "Waitlist",
  slotTime: string,
  dateLabel: string,
  sessionName: string,
  position?: number,
) {
  const provider = getEmailProvider();
  const subject =
    status === "Confirmed"
      ? `Booking confirmed — ${sessionName} (${dateLabel} ${slotTime})`
      : `You're on the waitlist — ${sessionName} (${dateLabel} ${slotTime})`;
  const lines =
    status === "Confirmed"
      ? [
          `Thanks for booking — your spot is confirmed.`,
          ``,
          `Session: ${sessionName}`,
          `Date: ${dateLabel}`,
          `Time: ${slotTime}`,
          ``,
          `If you can no longer attend, please cancel as early as possible so someone on the waitlist can take your place.`,
          ``,
          `See you there!`,
          `— Coach J`,
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
        ];
  return provider.send({ to, subject, text: lines.join("\n") });
}

export async function sendPromotionEmail(to: string, slotTime: string, dateLabel: string) {
  const provider = getEmailProvider();
  const subject = `You're confirmed for training (${dateLabel} ${slotTime})`;
  const text = [
    `Good news — a spot opened up and you've been promoted from the waitlist.`,
    ``,
    `Date: ${dateLabel}`,
    `Time: ${slotTime}`,
    ``,
    `See you there!`,
    `— Coach J`,
  ].join("\n");
  return provider.send({ to, subject, text });
}
