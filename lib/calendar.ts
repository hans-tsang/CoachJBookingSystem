// Helpers for building "add to calendar" links/ICS content from a booking's
// slot information. Designed so the email layer can render Apple / Google /
// Outlook buttons for Confirmed bookings (see lib/email.ts).

import { getBookingsTimezone } from "./settings";

export type CalendarEvent = {
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
};

/**
 * Parse a `Slot.time` string like "20:30-22:00" or "20:30 - 22:00" into its
 * start/end "HH:MM" components. Returns null when the input doesn't match the
 * expected pattern (e.g. malformed seed data).
 */
export function parseSlotTimeRange(
  time: string,
): { start: string; end: string } | null {
  const m = time.match(/^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/);
  if (!m) return null;
  const sh = Number(m[1]);
  const sm = Number(m[2]);
  const eh = Number(m[3]);
  const em = Number(m[4]);
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${pad(sh)}:${pad(sm)}`, end: `${pad(eh)}:${pad(em)}` };
}

/**
 * Returns the offset (in milliseconds) between the given timezone and UTC for
 * a particular instant: `localWallClockTime - utcTime`. Mirrors the helper in
 * `lib/settings.ts` (kept module-local there); positive values mean the zone
 * is ahead of UTC (e.g. +8h for Asia/Shanghai).
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
  // `Intl.DateTimeFormat` with `hour12: false` reports midnight as "24" in
  // some locales/runtimes — normalize to 0 so `Date.UTC` doesn't roll over.
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
 * Compute UTC instants for a slot's start/end given the slot's calendar date
 * (stored as UTC midnight representing a local calendar day) and the slot's
 * local time string. The wall-clock time is interpreted in the configured
 * `BOOKINGS_TIMEZONE` (defaults to Asia/Shanghai). Returns null when the time
 * string is malformed.
 */
export function getEventInstants(
  slotDate: Date,
  slotTime: string,
  timeZone: string = getBookingsTimezone(),
): { start: Date; end: Date } | null {
  const range = parseSlotTimeRange(slotTime);
  if (!range) return null;
  const [sh, sm] = range.start.split(":").map(Number);
  const [eh, em] = range.end.split(":").map(Number);
  const y = slotDate.getUTCFullYear();
  const mo = slotDate.getUTCMonth();
  const d = slotDate.getUTCDate();
  // Wall-clock "as if UTC" instants. Used both as the comparison basis for the
  // overnight check and as the reference instant for the timezone offset.
  const startWall = Date.UTC(y, mo, d, sh, sm);
  const endWallRaw = Date.UTC(y, mo, d, eh, em);
  // Roll the end to the next day if the time range crosses midnight.
  const endWall =
    endWallRaw <= startWall ? endWallRaw + 24 * 60 * 60 * 1000 : endWallRaw;
  const offset = getTimezoneOffsetMs(new Date(startWall), timeZone);
  // local wall-clock = UTC + offset  ⇒  UTC = local - offset
  return { start: new Date(startWall - offset), end: new Date(endWall - offset) };
}

/** Format a Date as `YYYYMMDDTHHMMSSZ` (compact ISO 8601 in UTC). */
export function formatUtcCompact(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${da}T${h}${mi}${s}Z`;
}

/** Build a Google Calendar pre-fill URL for the given event. */
export function buildGoogleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${formatUtcCompact(e.start)}/${formatUtcCompact(e.end)}`,
    details: e.description,
    location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Build an Outlook (web) Calendar pre-fill URL for the given event. */
export function buildOutlookCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: e.title,
    body: e.description,
    location: e.location,
    startdt: e.start.toISOString(),
    enddt: e.end.toISOString(),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** Escape a value for inclusion in an ICS TEXT property (RFC 5545 §3.3.11). */
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Build a minimal RFC 5545 VCALENDAR document for a single event. */
export function buildIcsContent(e: CalendarEvent, uid: string): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Coach J//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatUtcCompact(new Date())}`,
    `DTSTART:${formatUtcCompact(e.start)}`,
    `DTEND:${formatUtcCompact(e.end)}`,
    `SUMMARY:${escapeIcsText(e.title)}`,
    `DESCRIPTION:${escapeIcsText(e.description)}`,
    `LOCATION:${escapeIcsText(e.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * Build the absolute URL to our `/api/calendar/ics` endpoint that serves a
 * downloadable `.ics` for the given event. Used as the "Apple" link in emails;
 * iOS Mail / macOS Mail will hand the file off to Calendar, while desktop
 * browsers download it for import into other clients.
 */
export function buildIcsDownloadUrl(baseUrl: string, e: CalendarEvent): string {
  const params = new URLSearchParams({
    title: e.title,
    description: e.description,
    location: e.location,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
  });
  return `${baseUrl.replace(/\/+$/, "")}/api/calendar/ics?${params.toString()}`;
}
