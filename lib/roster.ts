import { formatMonthDay } from "./utils";

export type RosterBooking = {
  name: string;
  uber: boolean;
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
  date: Date,
  location: string,
  coachFee: number,
  gymFee: number,
  slots: SlotWithBookings[],
): string {
  const header: string[] = [];
  header.push(`*HYROX training on ${formatMonthDay(date)}*`);
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
