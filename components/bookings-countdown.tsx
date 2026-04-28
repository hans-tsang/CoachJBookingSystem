"use client";

import * as React from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  if (days > 0 || hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function formatLocal(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * Pre-open gate UI. Server-rendered when `bookingsOpenAt` is in the future.
 * The countdown ticks client-side. Once it reaches zero we refresh the page
 * so the server can render the actual booking form.
 */
export function BookingsCountdown({ openAtISO }: { openAtISO: string }) {
  const target = React.useMemo(() => {
    const t = new Date(openAtISO).getTime();
    return Number.isFinite(t) ? t : null;
  }, [openAtISO]);
  // Tick-driven render. We compute "remaining" from `target - Date.now()` only
  // inside the interval callback, so render itself stays pure.
  const [remaining, setRemaining] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (target === null) return;
    const tick = () => setRemaining(target - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  React.useEffect(() => {
    if (remaining !== null && remaining <= 0) {
      // Reload so the server gate re-evaluates and renders the booking form.
      window.location.reload();
    }
  }, [remaining]);

  if (target === null) {
    return (
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
        Bookings are not open yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center">
      <p className="text-sm font-medium uppercase tracking-wider text-[var(--color-brand)]">
        Bookings open in
      </p>
      <p
        className="font-mono text-3xl font-bold tabular-nums sm:text-4xl"
        aria-live="polite"
      >
        {remaining === null ? "…" : formatRemaining(remaining)}
      </p>
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Opens at{" "}
        <time dateTime={openAtISO}>{formatLocal(new Date(openAtISO))}</time>
      </p>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        This page will refresh automatically when bookings open.
      </p>
    </div>
  );
}
