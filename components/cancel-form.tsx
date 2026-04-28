"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelBookingAction, type ActionResult } from "@/app/(public)/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} variant="danger" size="lg" className="w-full">
      {pending ? "Cancelling..." : "Cancel my booking"}
    </Button>
  );
}

export function CancelForm() {
  const [state, formAction] = React.useActionState<
    ActionResult<{ promoted: string | null }> | null,
    FormData
  >(cancelBookingAction, null);

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4 rounded-md border border-[var(--color-success)] bg-[var(--color-success)]/10 p-4">
        <p className="text-sm font-medium">Your booking has been cancelled.</p>
        {state.data?.promoted ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {state.data.promoted} has been promoted from the waitlist.
          </p>
        ) : null}
        <Link href="/" className="text-sm text-[var(--color-brand)] underline-offset-4 hover:underline">
          ← Back to bookings
        </Link>
      </div>
    );
  }

  const fieldError = (name: string) =>
    state && !state.ok && state.fieldErrors?.[name]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required autoComplete="name" />
        {fieldError("name") ? (
          <p className="text-xs text-[var(--color-danger)]">{fieldError("name")}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="whatsapp">WhatsApp</Label>
        <Input id="whatsapp" name="whatsapp" required inputMode="tel" autoComplete="tel" />
        {fieldError("whatsapp") ? (
          <p className="text-xs text-[var(--color-danger)]">{fieldError("whatsapp")}</p>
        ) : null}
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--color-danger)]">{state.error}</p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
