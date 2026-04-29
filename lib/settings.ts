import { prisma } from "./db";
import { nextSaturday, toISODate } from "./utils";

export type AppSettings = {
  gymLocation: string;
  trainingDate: Date;
  coachFee: number;
  gymFee: number;
  /** Bookings are gated until this instant. Null = open immediately. */
  bookingsOpenAt: Date | null;
  /**
   * Admin-configured close instant. Null when no override is stored, in which
   * case `effectiveBookingsCloseAt` falls back to the start of `trainingDate`.
   */
  bookingsCloseAt: Date | null;
  /**
   * Resolved close instant used to gate bookings. Equals `bookingsCloseAt`
   * when set, otherwise defaults to midnight at the start of `trainingDate`
   * in the configured booking timezone (see `getBookingsTimezone`) — i.e.,
   * "the night before training day's local midnight".
   */
  effectiveBookingsCloseAt: Date;
};

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
  // `hour` may be reported as "24" at midnight in some locales; normalise.
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
 * `getBookingsTimezone`). Equivalent to "the night before training date's
 * midnight" in that timezone.
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
  // Compute the offset at the candidate instant; subtracting it shifts UTC
  // midnight back to local-wall-clock midnight in the target timezone.
  const offset = getTimezoneOffsetMs(new Date(utcMidnight), timeZone);
  return new Date(utcMidnight - offset);
}

const DEFAULTS = {
  gymLocation: "TBD",
  coachFee: "150",
  gymFee: "100",
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const trainingDateStr = map.get("trainingDate");
  const trainingDate = trainingDateStr
    ? new Date(`${trainingDateStr}T00:00:00.000Z`)
    : nextSaturday();

  const bookingsOpenAtStr = map.get("bookingsOpenAt");
  let bookingsOpenAt: Date | null = null;
  if (bookingsOpenAtStr) {
    const parsed = new Date(bookingsOpenAtStr);
    if (!Number.isNaN(parsed.getTime())) bookingsOpenAt = parsed;
  }

  const bookingsCloseAtStr = map.get("bookingsCloseAt");
  let bookingsCloseAt: Date | null = null;
  if (bookingsCloseAtStr) {
    const parsed = new Date(bookingsCloseAtStr);
    if (!Number.isNaN(parsed.getTime())) bookingsCloseAt = parsed;
  }

  return {
    gymLocation: map.get("gymLocation") ?? DEFAULTS.gymLocation,
    trainingDate,
    coachFee: parseInt(map.get("coachFee") ?? DEFAULTS.coachFee, 10),
    gymFee: parseInt(map.get("gymFee") ?? DEFAULTS.gymFee, 10),
    bookingsOpenAt,
    bookingsCloseAt,
    effectiveBookingsCloseAt: bookingsCloseAt ?? defaultBookingsCloseAt(trainingDate),
  };
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

export async function updateSettings(input: {
  gymLocation: string;
  trainingDate: string; // YYYY-MM-DD
  coachFee: number;
  gymFee: number;
  /** ISO datetime string in UTC, or empty/null to clear (open immediately). */
  bookingsOpenAt?: string | null;
  /** ISO datetime string in UTC, or empty/null to clear (never auto-closes). */
  bookingsCloseAt?: string | null;
}): Promise<void> {
  const bookingsOpenAtValue =
    input.bookingsOpenAt && input.bookingsOpenAt.length > 0 ? input.bookingsOpenAt : "";
  const bookingsCloseAtValue =
    input.bookingsCloseAt && input.bookingsCloseAt.length > 0 ? input.bookingsCloseAt : "";
  await prisma.$transaction([
    prisma.setting.upsert({
      where: { key: "gymLocation" },
      create: { key: "gymLocation", value: input.gymLocation },
      update: { value: input.gymLocation },
    }),
    prisma.setting.upsert({
      where: { key: "trainingDate" },
      create: { key: "trainingDate", value: input.trainingDate },
      update: { value: input.trainingDate },
    }),
    prisma.setting.upsert({
      where: { key: "coachFee" },
      create: { key: "coachFee", value: String(input.coachFee) },
      update: { value: String(input.coachFee) },
    }),
    prisma.setting.upsert({
      where: { key: "gymFee" },
      create: { key: "gymFee", value: String(input.gymFee) },
      update: { value: String(input.gymFee) },
    }),
    prisma.setting.upsert({
      where: { key: "bookingsOpenAt" },
      create: { key: "bookingsOpenAt", value: bookingsOpenAtValue },
      update: { value: bookingsOpenAtValue },
    }),
    prisma.setting.upsert({
      where: { key: "bookingsCloseAt" },
      create: { key: "bookingsCloseAt", value: bookingsCloseAtValue },
      update: { value: bookingsCloseAtValue },
    }),
  ]);
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
