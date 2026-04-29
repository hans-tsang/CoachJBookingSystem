import { formatMonthDay } from "./utils";

export type RosterBooking = {
  name: string;
  uber: boolean;
  status: "Confirmed" | "Waitlist" | "Cancelled";
  createdAt: Date;
};

export type PaymentBooking = {
  name: string;
  uber: boolean;
  paid: boolean;
  /** Total amount the booking should pay (including Uber if applicable). May be null if not recorded. */
  amount: number | null;
  status: "Confirmed" | "Waitlist" | "Cancelled";
  createdAt: Date;
};

export type SlotWithBookings = {
  time: string;
  capacity: number;
  order: number;
  bookings: RosterBooking[];
};

/**
 * Produce the WhatsApp roster text that Coach J pastes into the group chat.
 * Format is intentionally exact — see tests/roster.test.ts for fixtures.
 */
export function formatRoster(
  sessionName: string,
  date: Date,
  location: string,
  coachFee: number,
  gymFee: number,
  slots: SlotWithBookings[],
): string {
  const header: string[] = [];
  header.push(`*${sessionName} training on ${formatMonthDay(date)}*`);
  header.push("");
  header.push(`**Location:** ${location}`);
  header.push("");
  header.push(`Coach Training Fee - $${coachFee}`);
  header.push(`Gym Fee - $${gymFee}`);

  const sections: string[] = [];

  const sortedSlots = [...slots].sort((a, b) => a.order - b.order);

  for (const slot of sortedSlots) {
    const lines: string[] = [];
    lines.push("");
    lines.push(`*(${slot.time})* `);

    const active = slot.bookings.filter((b) => b.status !== "Cancelled");
    const confirmed = active
      .filter((b) => b.status === "Confirmed")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const waitlist = active
      .filter((b) => b.status === "Waitlist")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    for (let i = 0; i < slot.capacity; i++) {
      const b = confirmed[i];
      if (b) {
        lines.push(`${i + 1}. ${b.name}${b.uber ? " (Uber)" : ""}`);
      } else {
        lines.push(`${i + 1}. `);
      }
    }

    if (confirmed.length >= slot.capacity) {
      lines.push("***FULL***");
    }

    if (waitlist.length > 0) {
      lines.push("");
      lines.push("Waiting list:");
      for (const w of waitlist) {
        lines.push(`${w.name}${w.uber ? " (Uber)" : ""}`);
      }
    }

    sections.push(lines.join("\n"));
  }

  return [header.join("\n"), ...sections].join("\n");
}

/** Parse a "HH:MM-HH:MM" label and return the start time as minutes from midnight. */
export function parseTimeLabel(label: string): { startMin: number; endMin: number } | null {
  const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(label);
  if (!match) return null;
  const startMin = Number(match[1]) * 60 + Number(match[2]);
  const endMin = Number(match[3]) * 60 + Number(match[4]);
  return { startMin, endMin };
}

/**
 * Produce the WhatsApp payment-summary text that Coach J pastes into the group chat
 * to chase fees. Confirmed bookings only, ordered by createdAt ASC. A ✅ is appended
 * to the names of bookings that have been marked paid.
 *
 * Format example:
 *   *HYROX training fee - Apr 25*
 *
 *   Coach Training Fee - $150
 *   Gym Fee - $40
 *
 *   Alice- $190✅
 *   Bob- $190+Uber $42 =$232✅
 *   Carol- $190
 */
export function formatPaymentSummary(
  sessionName: string,
  date: Date,
  coachFee: number,
  gymFee: number,
  bookings: PaymentBooking[],
): string {
  const base = coachFee + gymFee;
  const lines: string[] = [];
  lines.push(`*${sessionName} training fee - ${formatMonthDay(date)}*`);
  lines.push("");
  lines.push(`Coach Training Fee - $${coachFee}`);
  lines.push(`Gym Fee - $${gymFee}`);
  lines.push("");

  const confirmed = bookings
    .filter((b) => b.status === "Confirmed")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const b of confirmed) {
    const tick = b.paid ? "✅" : "";
    // If we recorded a custom amount above the base and the booking has Uber,
    // surface the breakdown. Otherwise just show the base.
    const total = typeof b.amount === "number" && b.amount > 0 ? b.amount : base;
    if (b.uber && total > base) {
      const uberPortion = total - base;
      lines.push(`${b.name}- $${base}+Uber $${uberPortion} =$${total}${tick}`);
    } else {
      lines.push(`${b.name}- $${total}${tick}`);
    }
  }

  return lines.join("\n");
}
