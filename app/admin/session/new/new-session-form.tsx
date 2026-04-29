"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSessionAction, type AdminActionResult } from "@/app/admin/actions";

function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

function DateTimeField({
  name,
  label,
  helpText,
}: {
  name: string;
  label: string;
  helpText: string;
}) {
  const [local, setLocal] = React.useState("");
  const tz = getLocalTimezone();
  const isoUtc = local ? new Date(local).toISOString() : "";
  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label htmlFor={`${name}-input`}>
        {label}{" "}
        <span
          className="font-normal text-[var(--color-muted-foreground)]"
          suppressHydrationWarning
        >
          {tz ? `(${tz})` : ""}
        </span>
      </Label>
      <input type="hidden" name={name} value={isoUtc} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`${name}-input`}
          type="datetime-local"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          className="sm:max-w-xs"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setLocal("")}
          disabled={!local}
        >
          Clear
        </Button>
      </div>
      <p className="text-xs text-[var(--color-muted-foreground)]">{helpText}</p>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      Create session
    </Button>
  );
}

export function NewSessionForm() {
  const [state, setState] = React.useState<AdminActionResult | null>(null);

  return (
    <form
      action={async (fd) => {
        const result = await createSessionAction(state, fd);
        // createSessionAction redirects on success; we only get here on error.
        setState(result);
      }}
      className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="name">Session name</Label>
          <Input
            id="name"
            name="name"
            required
            placeholder="e.g. HYROX, CrossFit, Personal Training"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" required placeholder="Coach J Gym, Hong Kong" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date">Date</Label>
          <Input id="date" name="date" type="date" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="coachFee">Coach fee ($)</Label>
          <Input id="coachFee" name="coachFee" type="number" min={0} defaultValue={150} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gymFee">Gym fee ($)</Label>
          <Input id="gymFee" name="gymFee" type="number" min={0} defaultValue={100} required />
        </div>
        <DateTimeField
          name="openAt"
          label="Bookings open at"
          helpText="Leave blank to open bookings immediately."
        />
        <DateTimeField
          name="closeAt"
          label="Bookings close at"
          helpText="Leave blank to default to midnight at the start of the session date."
        />
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--color-danger)]">{state.error}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton />
        <Link href="/admin">
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}
