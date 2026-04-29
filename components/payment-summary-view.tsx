"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatPaymentSummary, type PaymentBooking } from "@/lib/roster";
import { parseISODate } from "@/lib/utils";
import type { AdminBookingRow } from "./bookings-table";

type Props = {
  sessionName: string;
  bookings: AdminBookingRow[];
  coachFee: number;
  gymFee: number;
  /** Training date as YYYY-MM-DD (UTC). */
  trainingDate: string;
};

function toPaymentBookings(rows: AdminBookingRow[]): PaymentBooking[] {
  return rows.map((b) => ({
    name: b.name,
    uber: b.uber,
    paid: b.paid,
    amount: b.amount,
    status:
      b.status === "Waitlist"
        ? "Waitlist"
        : b.status === "Cancelled"
          ? "Cancelled"
          : "Confirmed",
    createdAt: new Date(b.createdAt),
  }));
}

/**
 * WhatsApp payment-summary panel shown above the bookings table. Mirrors the
 * pattern in RosterView: editable textarea + Copy + Share to WhatsApp buttons.
 *
 * The summary is computed client-side from the (optimistic) bookings prop so
 * that ticking the Paid checkbox in the table refreshes the text in real time,
 * without waiting for a page reload. The textarea remains locally editable;
 * any pending edits are replaced when the upstream data changes (e.g. another
 * booking is marked paid).
 */
export function PaymentSummaryView({
  sessionName,
  bookings,
  coachFee,
  gymFee,
  trainingDate,
}: Props) {
  const { toast } = useToast();

  const computed = React.useMemo(
    () =>
      formatPaymentSummary(
        sessionName,
        parseISODate(trainingDate),
        coachFee,
        gymFee,
        toPaymentBookings(bookings),
      ),
    [sessionName, bookings, coachFee, gymFee, trainingDate],
  );

  // Re-seed the editable textarea whenever the computed summary changes
  // (e.g. when a Paid checkbox is toggled). Uses the "adjusting state during
  // rendering" pattern from the React docs — React bails out and restarts the
  // render with the new state, so this is the canonical alternative to a
  // setState-in-effect (which the lint rule disallows).
  const [text, setText] = React.useState(computed);
  const [prevComputed, setPrevComputed] = React.useState(computed);
  if (prevComputed !== computed) {
    setPrevComputed(computed);
    setText(computed);
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: "Payment summary copied to clipboard.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Try selecting and copying manually.",
        variant: "error",
      });
    }
  };

  const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;

  return (
    <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <summary className="cursor-pointer text-base font-semibold">
        Payment summary (WhatsApp)
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="focus-ring min-h-[260px] w-full whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={copy}>
            Copy to clipboard
          </Button>
          <a href={waUrl} target="_blank" rel="noopener noreferrer">
            <Button type="button" variant="secondary">
              Share to WhatsApp
            </Button>
          </a>
        </div>
      </div>
    </details>
  );
}
