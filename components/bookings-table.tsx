"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { markPaidAction, adminCancelAction } from "@/app/admin/actions";
import { useToast } from "@/components/ui/toast";

export type AdminBookingRow = {
  id: string;
  slotTime: string;
  name: string;
  whatsapp: string;
  email: string | null;
  uber: boolean;
  payment: string;
  amount: number | null;
  paid: boolean;
  status: string;
  note: string | null;
  createdAt: string; // ISO
};

type SortKey = "createdAt" | "name" | "slotTime" | "status" | "paid";

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PaidToggle({
  id,
  paid,
  setOptimisticPaid,
}: {
  id: string;
  paid: boolean;
  setOptimisticPaid: (update: { id: string; paid: boolean }) => void;
}) {
  // Optimistic UI: flip immediately, revert on error. Works around the perception
  // that the underlying server action ("mark paid") feels unresponsive. The
  // optimistic state is owned by the parent (AdminDashboard) so that the
  // payment summary panel can refresh in real time off the same source of truth.
  const [isPending, startTransition] = React.useTransition();
  const { toast } = useToast();

  const onClick = () => {
    const next = !paid;
    startTransition(async () => {
      setOptimisticPaid({ id, paid: next });
      try {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("paid", String(next));
        await markPaidAction(fd);
      } catch {
        // useOptimistic auto-reverts when the transition ends without a server-confirmed update.
        toast({
          title: "Couldn't update",
          description: "Failed to update payment status. Please try again.",
          variant: "error",
        });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-pressed={paid}
      aria-label={paid ? "Mark unpaid" : "Mark paid"}
      className="focus-ring inline-flex h-5 w-5 items-center justify-center rounded border border-[var(--color-border)] disabled:opacity-50"
    >
      {paid ? "✓" : ""}
    </button>
  );
}

export function BookingsTable({
  rows,
  setOptimisticPaid,
}: {
  rows: AdminBookingRow[];
  setOptimisticPaid: (update: { id: string; paid: boolean }) => void;
}) {
  const [sortKey, setSortKey] = React.useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [filter, setFilter] = React.useState("");
  const { toast } = useToast();

  const sorted = React.useMemo(() => {
    const f = filter.trim().toLowerCase();
    const filtered = f
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(f) ||
            r.whatsapp.includes(f) ||
            (r.email ?? "").toLowerCase().includes(f) ||
            r.slotTime.includes(f),
        )
      : rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "boolean" && typeof bv === "boolean") {
        return (Number(av) - Number(bv)) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sortKey, sortDir, filter]);

  const headerBtn = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => {
        if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
        else {
          setSortKey(key);
          setSortDir("asc");
        }
      }}
      className="text-left font-semibold uppercase tracking-wide hover:underline"
    >
      {label}
      {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
        No bookings yet for this week.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name, phone, email, slot..."
        className="focus-ring h-9 w-full max-w-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm"
      />
      <Table>
        <THead>
          <TR>
            <TH>{headerBtn("slotTime", "Slot")}</TH>
            <TH>{headerBtn("name", "Name")}</TH>
            <TH>WhatsApp</TH>
            <TH>Email</TH>
            <TH>{headerBtn("status", "Status")}</TH>
            <TH>{headerBtn("paid", "Paid")}</TH>
            <TH>Payment</TH>
            <TH>Uber</TH>
            <TH>{headerBtn("createdAt", "Created")}</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {sorted.map((r) => (
            <TR key={r.id} className={r.status === "Cancelled" ? "opacity-50" : ""}>
              <TD className="font-mono text-xs">{r.slotTime}</TD>
              <TD className="font-medium">{r.name}</TD>
              <TD className="font-mono text-xs">{r.whatsapp}</TD>
              <TD className="text-xs">{r.email ?? "—"}</TD>
              <TD>
                <span
                  className={
                    r.status === "Confirmed"
                      ? "rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-xs text-[var(--color-success)]"
                      : r.status === "Waitlist"
                        ? "rounded-full bg-[var(--color-warning)]/15 px-2 py-0.5 text-xs text-[var(--color-warning)]"
                        : "rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs"
                  }
                >
                  {r.status}
                </span>
              </TD>
              <TD>
                <PaidToggle id={r.id} paid={r.paid} setOptimisticPaid={setOptimisticPaid} />
              </TD>
              <TD className="text-xs">{r.payment}</TD>
              <TD className="text-xs">{r.uber ? "Yes" : "—"}</TD>
              <TD className="whitespace-nowrap text-xs">
                <time dateTime={r.createdAt}>{formatCreatedAt(r.createdAt)}</time>
              </TD>
              <TD className="text-right">
                {r.status !== "Cancelled" ? (
                  <form action={adminCancelAction} className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        if (!confirm(`Cancel booking for ${r.name}?`)) {
                          e.preventDefault();
                          return;
                        }
                        toast({ description: "Cancelling..." });
                      }}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : null}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
