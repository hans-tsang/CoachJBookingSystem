import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { buildIcsContent } from "@/lib/calendar";

export const dynamic = "force-dynamic";

/**
 * Serves a downloadable `.ics` file built from query parameters. Used by the
 * "Apple" add-to-calendar link in booking emails; iOS / macOS Mail will hand
 * the file off to Calendar, other clients will download it for import.
 *
 * Query params:
 *   - title       (required) Event SUMMARY
 *   - start       (required) ISO 8601 start instant
 *   - end         (required) ISO 8601 end instant
 *   - location    (optional) Event LOCATION
 *   - description (optional) Event DESCRIPTION
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const title = url.searchParams.get("title");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const description = url.searchParams.get("description") ?? "";
  const location = url.searchParams.get("location") ?? "";

  if (!title || !start || !end) {
    return NextResponse.json(
      { ok: false, error: "missing required parameters: title, start, end" },
      { status: 400 },
    );
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate.getTime() <= startDate.getTime()
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid start/end datetimes" },
      { status: 400 },
    );
  }

  // UID is per-download. Calendars de-dupe on import by UID, so a stable UID
  // would be nicer if a user re-imports — but we don't persist booking IDs
  // into the email link, so a fresh UID is acceptable. Uses crypto.randomUUID
  // (not for security; just to satisfy linters that flag Math.random here).
  const uid = `${randomUUID()}@coachj`;
  const ics = buildIcsContent(
    { title, description, location, start: startDate, end: endDate },
    uid,
  );

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="event.ics"',
      "Cache-Control": "no-store",
    },
  });
}
