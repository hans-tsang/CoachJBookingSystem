"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Props = {
  paymentSummaryText: string;
};

/**
 * WhatsApp payment-summary panel shown above the bookings table. Mirrors the
 * pattern in RosterView: editable textarea + Copy + Share to WhatsApp buttons.
 * The textarea seeds from the server-rendered text and is locally editable;
 * a full page reload picks up newly generated text after fee/booking changes.
 */
export function PaymentSummaryView({ paymentSummaryText }: Props) {
  const { toast } = useToast();
  const [text, setText] = React.useState(paymentSummaryText);

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
