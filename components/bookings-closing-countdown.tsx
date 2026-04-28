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
 * Inline closing-countdown shown above the booking form while bookings are
 * open. The countdown ticks client-side. Once it reaches zero we refresh the
 * page so the server gate re-evaluates and renders the closed notice.
 */
export function BookingsClosingCountdown({ closeAtISO }: { closeAtISO: string }) {
  const target = React.useMemo(() => {
    const t = new Date(closeAtISO).getTime();
    return Number.isFinite(t) ? t : null;
  }, [closeAtISO]);
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
      // Reload so the server gate re-evaluates and renders the closed notice.
      window.location.reload();
    }
  }, [remaining]);

  if (target === null) return null;

  return (
    <div
      className="flex flex-col items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-center sm:flex-row sm:justify-center sm:gap-3"
      role="status"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-brand)]">
        Bookings close in
      </p>
      <p
        className="font-mono text-lg font-bold tabular-nums sm:text-xl"
        aria-live="polite"
      >
        {remaining === null ? "…" : formatRemaining(remaining)}
      </p>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        <time dateTime={closeAtISO}>{formatLocal(new Date(closeAtISO))}</time>
      </p>
    </div>
  );
}
