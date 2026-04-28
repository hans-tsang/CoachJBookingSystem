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

export function BookingsTable({ rows }: { rows: AdminBookingRow[] }) {
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
            <TH>{headerBtn("status", "Status")}</TH>
            <TH>{headerBtn("paid", "Paid")}</TH>
            <TH>Payment</TH>
            <TH>Uber</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {sorted.map((r) => (
            <TR key={r.id} className={r.status === "Cancelled" ? "opacity-50" : ""}>
              <TD className="font-mono text-xs">{r.slotTime}</TD>
              <TD className="font-medium">{r.name}</TD>
              <TD className="font-mono text-xs">{r.whatsapp}</TD>
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
                <form action={markPaidAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="paid" value={(!r.paid).toString()} />
                  <button
                    type="submit"
                    className="focus-ring inline-flex h-5 w-5 items-center justify-center rounded border border-[var(--color-border)]"
                    aria-label={r.paid ? "Mark unpaid" : "Mark paid"}
                  >
                    {r.paid ? "✓" : ""}
                  </button>
                </form>
              </TD>
              <TD className="text-xs">{r.payment}</TD>
              <TD className="text-xs">{r.uber ? "Yes" : "—"}</TD>
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
