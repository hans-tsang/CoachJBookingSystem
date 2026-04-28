"use client";

import * as React from "react";

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
 * Notice shown on the public page once bookings have closed (i.e. the current
 * time is at or past `bookingsCloseAt`). Server-rendered when the gate
 * resolves to "closed".
 */
export function BookingsClosedNotice({ closeAtISO }: { closeAtISO: string | null }) {
  const closedAt = React.useMemo(() => {
    if (!closeAtISO) return null;
    const t = new Date(closeAtISO);
    return Number.isNaN(t.getTime()) ? null : t;
  }, [closeAtISO]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center">
      <p className="text-sm font-medium uppercase tracking-wider text-[var(--color-brand)]">
        Bookings closed
      </p>
      <p className="text-base">
        Bookings for this session are no longer accepted.
      </p>
      {closedAt ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Closed at{" "}
          <time dateTime={closedAt.toISOString()}>{formatLocal(closedAt)}</time>
        </p>
      ) : null}
      <p className="text-xs text-[var(--color-muted-foreground)]">
        If you need help, please contact Coach J.
      </p>
    </div>
  );
}
