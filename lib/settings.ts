import { prisma } from "./db";
import { nextSaturday, toISODate } from "./utils";

export type AppSettings = {
  gymLocation: string;
  trainingDate: Date;
  coachFee: number;
  gymFee: number;
  /** Bookings are gated until this instant. Null = open immediately. */
  bookingsOpenAt: Date | null;
  /** Bookings are blocked once this instant passes. Null = never closes automatically. */
  bookingsCloseAt: Date | null;
};

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
