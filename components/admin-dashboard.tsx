"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { RosterView } from "./roster-view";
import { BookingsTable, type AdminBookingRow } from "./bookings-table";
import {
  updateSettingsAction,
  changePasswordAction,
  upsertSlotAction,
  deleteSlotAction,
  addWalkinAction,
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

function BookingsOpenAtField({ defaultValue }: { defaultValue: string }) {
  const [local, setLocal] = React.useState(() => isoToLocalInput(defaultValue));
  // Server and client may resolve different timezones; render label client-only
  // by reading inside a span with suppressed hydration warning.
  const tz = getLocalTimezone();
  // Browsers interpret `datetime-local` values in the local timezone, so
  // `new Date(local)` produces the correct UTC instant for submission.
  const isoUtc = local ? new Date(local).toISOString() : "";
  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label htmlFor="bookingsOpenAt-input">
        Bookings open at{" "}
        <span
          className="font-normal text-[var(--color-muted-foreground)]"
          suppressHydrationWarning
        >
          {tz ? `(${tz})` : ""}
        </span>
      </Label>
      <input type="hidden" name="bookingsOpenAt" value={isoUtc} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="bookingsOpenAt-input"
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
      <p className="text-xs text-[var(--color-muted-foreground)]">
        Leave blank to open bookings immediately. While set in the future, the
        public page shows a countdown and submissions are blocked.
      </p>
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
          <BookingsOpenAtField defaultValue={settings.bookingsOpenAt} />
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
        action={async (fd) => setState(await upsertSlotAction(state, fd))}
        className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
      >
        <h3 className="text-base font-semibold">Add slot</h3>
        <input type="hidden" name="trainingDate" value={trainingDate} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="time">Time</Label>
            <Select id="time" name="time" defaultValue="09:30-11:00" required>
              <option value="09:30-11:00">09:30-11:00</option>
              <option value="11:30-13:00">11:30-13:00</option>
              <option value="13:30-15:00">13:30-15:00</option>
            </Select>
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

function WalkinTab({ slots }: { slots: AdminSlot[] }) {
  const [state, setState] = React.useState<AdminActionResult | null>(null);
  if (slots.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Add a slot first before adding walk-ins.
      </p>
    );
  }
  return (
    <form
      action={async (fd) => setState(await addWalkinAction(state, fd))}
      className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
    >
      <h3 className="text-base font-semibold">Add walk-in</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="walk-slot">Slot</Label>
          <Select id="walk-slot" name="slotId" required>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.time}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="walk-name">Name</Label>
          <Input id="walk-name" name="name" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="walk-wa">WhatsApp</Label>
          <Input id="walk-wa" name="whatsapp" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="walk-payment">Payment</Label>
          <Select id="walk-payment" name="payment" defaultValue="Cash">
            <option value="PayMe">PayMe</option>
            <option value="FPS">FPS</option>
            <option value="Cash">Cash</option>
            <option value="Other">Other</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="walk-amount">Amount ($)</Label>
          <Input id="walk-amount" name="amount" type="number" min={0} />
        </div>
        <div className="flex items-end gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="paid" /> Paid
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="uber" /> Uber
          </label>
        </div>
      </div>
      <FormFeedback state={state} />
      <PendingButton>Add walk-in</PendingButton>
    </form>
  );
}

export function AdminDashboard(props: AdminDashboardProps) {
  const { toast } = useToast();
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
          { id: "walkin", label: "Walk-in" },
          { id: "slots", label: "Slots" },
          { id: "settings", label: "Settings" },
        ]}
      >
        {(active) => {
          if (active === "roster") return <RosterView rosterText={props.rosterText} />;
          if (active === "bookings") return <BookingsTable rows={props.bookings} />;
          if (active === "walkin") return <WalkinTab slots={props.slots} />;
          if (active === "slots")
            return <SlotsTab slots={props.slots} trainingDate={props.settings.trainingDate} />;
          if (active === "settings") return <SettingsTab settings={props.settings} />;
          return null;
        }}
      </Tabs>
    </main>
  );
}
