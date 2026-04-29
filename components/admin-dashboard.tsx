"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { RosterView } from "./roster-view";
import { BookingsTable, type AdminBookingRow } from "./bookings-table";
import { PaymentSummaryView } from "./payment-summary-view";
import {
  updateSettingsAction,
  changePasswordAction,
  upsertSlotAction,
  deleteSlotAction,
  resetWeekAction,
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
  rosterText: string;
  bookings: AdminBookingRow[];
  slots: AdminSlot[];
  settings: {
    gymLocation: string;
    trainingDate: string;
    coachFee: number;
    gymFee: number;
    /** ISO datetime string in UTC, or empty string if not gated. */
    bookingsOpenAt: string;
    /** ISO datetime string in UTC, or empty string if no auto-close. */
    bookingsCloseAt: string;
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
  // Server and client may resolve different timezones; render label client-only
  // by reading inside a span with suppressed hydration warning.
  const tz = getLocalTimezone();
  // Browsers interpret `datetime-local` values in the local timezone, so
  // `new Date(local)` produces the correct UTC instant for submission.
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
  settings,
}: {
  settings: AdminDashboardProps["settings"];
}) {
  const [s, setS] = React.useState<AdminActionResult | null>(null);
  const [p, setP] = React.useState<AdminActionResult | null>(null);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form
        action={async (fd) => setS(await updateSettingsAction(s, fd))}
        className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
      >
        <h3 className="text-base font-semibold">Training settings</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="gymLocation">Gym location</Label>
            <Input id="gymLocation" name="gymLocation" defaultValue={settings.gymLocation} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trainingDate">Training date</Label>
            <Input
              id="trainingDate"
              name="trainingDate"
              type="date"
              defaultValue={settings.trainingDate}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="coachFee">Coach fee ($)</Label>
            <Input
              id="coachFee"
              name="coachFee"
              type="number"
              min={0}
              defaultValue={settings.coachFee}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gymFee">Gym fee ($)</Label>
            <Input
              id="gymFee"
              name="gymFee"
              type="number"
              min={0}
              defaultValue={settings.gymFee}
            />
          </div>
          <BookingsDateTimeField
            name="bookingsOpenAt"
            label="Bookings open at"
            helpText="Leave blank to open bookings immediately. While set in the future, the public page shows a countdown and submissions are blocked."
            defaultValue={settings.bookingsOpenAt}
          />
          <BookingsDateTimeField
            name="bookingsCloseAt"
            label="Bookings close at"
            helpText="Leave blank to default to midnight at the start of the training date (the night before training). Once this time passes, the public page shows a closed notice and submissions are blocked. Must be after the opening time."
            defaultValue={settings.bookingsCloseAt}
          />
        </div>
        <FormFeedback state={s} />
        <PendingButton>Save settings</PendingButton>
      </form>

      <form
        action={async (fd) => setP(await changePasswordAction(p, fd))}
        className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
      >
        <h3 className="text-base font-semibold">Change admin password</h3>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input id="currentPassword" name="currentPassword" type="password" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newPassword">New password (min 8 chars)</Label>
          <Input id="newPassword" name="newPassword" type="password" required minLength={8} />
        </div>
        <FormFeedback state={p} />
        <PendingButton>Update password</PendingButton>
      </form>
    </div>
  );
}

function SlotsTab({
  slots,
  trainingDate,
}: {
  slots: AdminSlot[];
  trainingDate: string;
}) {
  const [state, setState] = React.useState<AdminActionResult | null>(null);
  const [startTime, setStartTime] = React.useState("09:30");
  const [endTime, setEndTime] = React.useState("11:00");

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <h3 className="mb-3 text-base font-semibold">Slots for {trainingDate}</h3>
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
        <input type="hidden" name="trainingDate" value={trainingDate} />
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
  // Shared optimistic view of bookings so the Paid toggle in the table and the
  // Payment summary panel update from a single source of truth in real time.
  const [optimisticBookings, applyOptimisticPaid] = React.useOptimistic(
    props.bookings,
    (state, update: { id: string; paid: boolean }) =>
      state.map((b) => (b.id === update.id ? { ...b, paid: update.paid } : b)),
  );
  const onResetWeek = async () => {
    if (
      !confirm(
        "Archive this week's bookings and clear them? The training date will advance to the next Saturday.",
      )
    )
      return;
    await resetWeekAction();
    toast({
      title: "Week reset",
      description: "Bookings archived and date advanced.",
      variant: "success",
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-brand)]">
            HYROX Admin
          </p>
          <h1 className="text-2xl font-bold">
            {props.settings.trainingDate} · {props.settings.gymLocation}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="danger" onClick={onResetWeek}>
            Reset week
          </Button>
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
                  bookings={optimisticBookings}
                  coachFee={props.settings.coachFee}
                  gymFee={props.settings.gymFee}
                  trainingDate={props.settings.trainingDate}
                />
                <BookingsTable
                  rows={optimisticBookings}
                  setOptimisticPaid={applyOptimisticPaid}
                />
              </div>
            );
          if (active === "slots")
            return <SlotsTab slots={props.slots} trainingDate={props.settings.trainingDate} />;
          if (active === "settings") return <SettingsTab settings={props.settings} />;
          return null;
        }}
      </Tabs>
    </main>
  );
}
