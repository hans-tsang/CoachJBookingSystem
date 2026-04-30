"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SlotCard, type SlotCardData } from "./slot-card";
import { createBookingAction, type ActionResult } from "@/app/(public)/actions";
import { useToast } from "@/components/ui/toast";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} size="lg" className="w-full">
      {pending ? "Booking..." : "Book my spot"}
    </Button>
  );
}

export function BookingForm({ slots }: { slots: SlotCardData[] }) {
  const [state, formAction] = React.useActionState<ActionResult | null, FormData>(
    createBookingAction,
    null,
  );
  const [selectedSlot, setSelectedSlot] = React.useState<string>(slots[0]?.id ?? "");
  const { toast } = useToast();

  React.useEffect(() => {
    if (state && !state.ok) {
      toast({ title: "Booking failed", description: state.error, variant: "error" });
    }
  }, [state, toast]);

  const fieldError = (name: string) =>
    state && !state.ok && state.fieldErrors?.[name]?.[0];

  if (slots.length === 0) {
    return (
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
        No slots are available yet. Please check back soon.
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Choose a slot</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((slot) => (
            <label key={slot.id} className="cursor-pointer">
              <input
                type="radio"
                name="slotId"
                value={slot.id}
                checked={selectedSlot === slot.id}
                onChange={() => setSelectedSlot(slot.id)}
                className="sr-only"
              />
              <SlotCard slot={slot} selected={selectedSlot === slot.id} />
            </label>
          ))}
        </div>
        {fieldError("slotId") ? (
          <p className="text-sm text-[var(--color-danger)]">{fieldError("slotId")}</p>
        ) : null}
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input id="name" name="name" required autoComplete="name" />
          {fieldError("name") ? (
            <p className="text-xs text-[var(--color-danger)]">{fieldError("name")}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="whatsapp">WhatsApp *</Label>
          <Input
            id="whatsapp"
            name="whatsapp"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="e.g. 9123 4567"
          />
          {fieldError("whatsapp") ? (
            <p className="text-xs text-[var(--color-danger)]">{fieldError("whatsapp")}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="email">Email (optional)</Label>
          <Input id="email" name="email" type="email" autoComplete="email" />
          {fieldError("email") ? (
            <p className="text-xs text-[var(--color-danger)]">{fieldError("email")}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment">Payment method</Label>
          <Select id="payment" name="payment" defaultValue="PayMe">
            <option value="PayMe">PayMe</option>
            <option value="FPS">FPS</option>
            <option value="Cash">Cash</option>
            <option value="Other">Other</option>
          </Select>
        </div>

        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="uber"
              className="h-4 w-4 rounded border-[var(--color-border)]"
            />
            Need an Uber?
          </label>
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}
