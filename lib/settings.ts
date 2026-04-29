import { prisma } from "./db";
import { toISODate } from "./utils";

/**
 * IANA timezone used to anchor "midnight at the start of the training day"
 * when computing the default booking close instant. Configurable via the
 * `BOOKINGS_TIMEZONE` environment variable; defaults to `Asia/Shanghai` to
 * match the deployment context. If the configured value is not a valid IANA
 * zone, falls back to UTC.
 */
export function getBookingsTimezone(): string {
  const tz = process.env.BOOKINGS_TIMEZONE;
  if (tz && tz.length > 0) {
    try {
      // Validate by attempting to format with the supplied timezone.
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {
      // Fall through to default below.
    }
  }
  return "Asia/Shanghai";
}

/**
 * Returns the offset (in milliseconds) between the given timezone and UTC
 * for a particular instant: `localWallClockTime - utcTime`. Positive values
 * mean the timezone is ahead of UTC (e.g. +8h for Asia/Shanghai).
 */
function getTimezoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const hour = Number(map.hour) === 24 ? 0 : Number(map.hour);
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - instant.getTime();
}

/**
 * Default close instant when no override is configured: midnight at the start
 * of the training day in the configured booking timezone (see
 * `getBookingsTimezone`).
 */
export function defaultBookingsCloseAt(
  trainingDate: Date,
  timeZone: string = getBookingsTimezone(),
): Date {
  const utcMidnight = Date.UTC(
    trainingDate.getUTCFullYear(),
    trainingDate.getUTCMonth(),
    trainingDate.getUTCDate(),
  );
  const offset = getTimezoneOffsetMs(new Date(utcMidnight), timeZone);
  return new Date(utcMidnight - offset);
}

/** Resolves the effective close instant for a session, falling back to the
 *  default (start-of-training-day in local timezone) when none is set. */
export function effectiveCloseAt(date: Date, closeAt: Date | null): Date {
  return closeAt ?? defaultBookingsCloseAt(date);
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/** Site-wide branding name (defaults to "Coach J Bookings"). */
export async function getSiteName(): Promise<string> {
  return (await getSetting("siteName")) ?? "Coach J Bookings";
}

export { toISODate };

/**
 * Returns true if bookings are currently open. When `openAt` is null, bookings
 * are always open. Otherwise they're open once `now >= openAt`.
 */
export function areBookingsOpen(openAt: Date | null, now: Date = new Date()): boolean {
  if (!openAt) return true;
  return now.getTime() >= openAt.getTime();
}

/**
 * Returns true if bookings have closed. When `closeAt` is null, bookings never
 * automatically close. Otherwise they're closed once `now >= closeAt`.
 */
export function areBookingsClosed(closeAt: Date | null, now: Date = new Date()): boolean {
  if (!closeAt) return false;
  return now.getTime() >= closeAt.getTime();
}

export type BookingsGateState = "pending" | "open" | "closed";

/**
 * Resolves the current booking gate state based on optional open/close instants.
 *  - "pending": bookings haven't opened yet (now < openAt)
 *  - "closed":  bookings have closed (now >= closeAt)
 *  - "open":    accepting bookings
 */
export function getBookingsGateState(
  openAt: Date | null,
  closeAt: Date | null,
  now: Date = new Date(),
): BookingsGateState {
  if (!areBookingsOpen(openAt, now)) return "pending";
  if (areBookingsClosed(closeAt, now)) return "closed";
  return "open";
}
