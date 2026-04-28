import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a Date as "MMM dd" — e.g., Jan 04, Dec 21. Locale-agnostic English short month. */
export function formatMonthDay(date: Date): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const m = months[date.getUTCMonth()];
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${m} ${d}`;
}

/** ISO date (YYYY-MM-DD) of the next Saturday on or after the given date (UTC). */
export function nextSaturday(from: Date = new Date()): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun, 6=Sat
  const offset = (6 - dow + 7) % 7; // 0 if Saturday
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

/** Parse a YYYY-MM-DD string into a UTC Date at midnight. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** Format a Date as YYYY-MM-DD in UTC. */
export function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
