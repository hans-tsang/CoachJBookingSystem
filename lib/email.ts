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
  const from = process.env.EMAIL_FROM ?? "HYROX <bookings@example.com>";
  cached = apiKey ? new ResendEmailProvider(apiKey, from) : new ConsoleEmailProvider();
  return cached;
}

/** Reset for tests / DI. */
export function setEmailProvider(provider: EmailProvider | null): void {
  cached = provider;
}

export async function sendPromotionEmail(to: string, slotTime: string, dateLabel: string) {
  const provider = getEmailProvider();
  const subject = `You're confirmed for HYROX training (${dateLabel} ${slotTime})`;
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
