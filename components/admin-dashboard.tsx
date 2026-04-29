"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { RosterView } from "./roster-view";
import { BookingsTable, type AdminBookingRow } from "./bookings-table";
import { PaymentSummaryView } from "./payment-summary-view";
import {
  updateSessionAction,
  upsertSlotAction,
  deleteSlotAction,
  archiveSessionAction,
  logoutAction,
  type AdminActionResult,
} from "@/app/admin/actions";

export type AdminSlot = {
  id: string;
  time: string;
  capacity: number;
  order: number;
};

export type AdminDashboardProps = {
  sessionId: string;
  rosterText: string;
  bookings: AdminBookingRow[];
  slots: AdminSlot[];
  session: {
    name: string;
    location: string;
    /** YYYY-MM-DD */
    date: string;
    coachFee: number;
    gymFee: number;
    /** ISO datetime string in UTC, or empty string if not gated. */
    openAt: string;
    /** ISO datetime string in UTC, or empty string if no auto-close. */
    closeAt: string;
    isArchived: boolean;
  };
};

function FormFeedback({ state }: { state: AdminActionResult | null }) {
  if (!state) return null;
  return (
    <p
      role="status"
      className={
        state.ok
          ? "text-sm text-[var(--color-success)]"
          : "text-sm text-[var(--color-danger)]"
      }
    >
      {state.ok ? state.message : state.error}
    </p>
  );
}

/** Convert an ISO UTC string to the value format expected by `<input type="datetime-local">` (in the user's local timezone). */
function isoToLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

function BookingsDateTimeField({
  name,
  label,
  helpText,
  defaultValue,
}: {
  name: string;
  label: string;
  helpText: string;
  defaultValue: string;
}) {
  const [local, setLocal] = React.useState(() => isoToLocalInput(defaultValue));
  const tz = getLocalTimezone();
  const isoUtc = local ? new Date(local).toISOString() : "";
  const inputId = `${name}-input`;
  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label htmlFor={inputId}>
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
          id={inputId}
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

function PendingButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...props}>
      {children}
    </Button>
  );
}

function SettingsTab({
  sessionId,
  session,
}: {
  sessionId: string;
  session: AdminDashboardProps["session"];
}) {
  const [s, setS] = React.useState<AdminActionResult | null>(null);

  return (
    <form
      action={async (fd) => setS(await updateSessionAction(s, fd))}
      className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
    >
      <input type="hidden" name="id" value={sessionId} />
      <h3 className="text-base font-semibold">Session settings</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="name">Session name</Label>
          <Input id="name" name="name" defaultValue={session.name} required />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" defaultValue={session.location} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date">Date</Label>
          <Input id="date" name="date" type="date" defaultValue={session.date} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="coachFee">Coach fee ($)</Label>
          <Input
            id="coachFee"
            name="coachFee"
            type="number"
            min={0}
            defaultValue={session.coachFee}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gymFee">Gym fee ($)</Label>
          <Input
            id="gymFee"
            name="gymFee"
            type="number"
            min={0}
            defaultValue={session.gymFee}
            required
          />
        </div>
        <BookingsDateTimeField
          name="openAt"
          label="Bookings open at"
          helpText="Leave blank to open bookings immediately. While set in the future, the public page shows a countdown and submissions are blocked."
          defaultValue={session.openAt}
        />
        <BookingsDateTimeField
          name="closeAt"
          label="Bookings close at"
          helpText="Leave blank to default to midnight at the start of the session date (the night before training). Once this time passes, the public page shows a closed notice and submissions are blocked. Must be after the opening time."
          defaultValue={session.closeAt}
        />
      </div>
      <FormFeedback state={s} />
      <PendingButton>Save settings</PendingButton>
    </form>
  );
}

function SlotsTab({
  sessionId,
  slots,
}: {
  sessionId: string;
  slots: AdminSlot[];
}) {
  const [state, setState] = React.useState<AdminActionResult | null>(null);
  const [startTime, setStartTime] = React.useState("09:30");
  const [endTime, setEndTime] = React.useState("11:00");

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <h3 className="mb-3 text-base font-semibold">Slots</h3>
        {slots.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            No slots yet — add one below.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {slots.map((slot) => (
              <li
                key={slot.id}
                className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] p-2 text-sm"
              >
                <span className="font-mono">{slot.time}</span>
                <span className="text-[var(--color-muted-foreground)]">
                  cap {slot.capacity} · order {slot.order}
                </span>
                <form action={deleteSlotAction}>
                  <input type="hidden" name="id" value={slot.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Delete
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        action={async (fd) => {
          fd.set("time", `${startTime}-${endTime}`);
          setState(await upsertSlotAction(state, fd));
        }}
        className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
      >
        <h3 className="text-base font-semibold">Add slot</h3>
        <input type="hidden" name="sessionId" value={sessionId} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startTime">Start time</Label>
            <Input
              id="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endTime">End time</Label>
            <Input
              id="endTime"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="capacity">Capacity</Label>
            <Input id="capacity" name="capacity" type="number" min={1} defaultValue={14} required />
          </div>
        </div>
        <FormFeedback state={state} />
        <PendingButton>Add slot</PendingButton>
      </form>
    </div>
  );
}

export function AdminDashboard(props: AdminDashboardProps) {
  const { toast } = useToast();
  const [optimisticBookings, applyOptimisticPaid] = React.useOptimistic(
    props.bookings,
    (state, update: { id: string; paid: boolean }) =>
      state.map((b) => (b.id === update.id ? { ...b, paid: update.paid } : b)),
  );
  const onArchive = async () => {
    if (
      !confirm(
        "Archive this session? It will no longer be shown to the public, but the bookings remain on record.",
      )
    )
      return;
    const fd = new FormData();
    fd.set("id", props.sessionId);
    await archiveSessionAction(fd);
    toast({
      title: "Session archived",
      description: "The session is no longer shown to the public.",
      variant: "success",
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin"
            className="text-xs text-[var(--color-muted-foreground)] underline-offset-4 hover:underline"
          >
            ← All sessions
          </Link>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-brand)]">
            {props.session.name}
          </p>
          <h1 className="text-2xl font-bold">
            {props.session.date} · {props.session.location}
          </h1>
          {props.session.isArchived ? (
            <p className="text-xs font-medium text-[var(--color-muted-foreground)]">
              (Archived)
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {!props.session.isArchived ? (
            <Button variant="danger" onClick={onArchive}>
              Archive session
            </Button>
          ) : null}
          <form action={logoutAction}>
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <Tabs
        tabs={[
          { id: "roster", label: "Roster" },
          { id: "bookings", label: "Bookings" },
          { id: "slots", label: "Slots" },
          { id: "settings", label: "Settings" },
        ]}
      >
        {(active) => {
          if (active === "roster") return <RosterView rosterText={props.rosterText} />;
          if (active === "bookings")
            return (
              <div className="flex flex-col gap-4">
                <PaymentSummaryView
                  sessionName={props.session.name}
                  bookings={optimisticBookings}
                  coachFee={props.session.coachFee}
                  gymFee={props.session.gymFee}
                  trainingDate={props.session.date}
                />
                <BookingsTable
                  rows={optimisticBookings}
                  setOptimisticPaid={applyOptimisticPaid}
                />
              </div>
            );
          if (active === "slots")
            return <SlotsTab sessionId={props.sessionId} slots={props.slots} />;
          if (active === "settings")
            return <SettingsTab sessionId={props.sessionId} session={props.session} />;
          return null;
        }}
      </Tabs>
    </main>
  );
}
