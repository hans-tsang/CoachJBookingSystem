import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getAllSessions } from "@/lib/session";
import { effectiveCloseAt, getBookingsGateState } from "@/lib/settings";
import { formatMonthDay } from "@/lib/utils";
import { archiveSessionAction, unarchiveSessionAction, logoutAction } from "./actions";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");

  const sessions = await getAllSessions();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-brand)]">
            Coach J Admin
          </p>
          <h1 className="text-2xl font-bold">Sessions</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/session/new">
            <Button>New session</Button>
          </Link>
          <Link href="/admin/settings">
            <Button variant="ghost">Account</Button>
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      {sessions.length === 0 ? (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] p-8 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            No sessions yet. Create your first one to start accepting bookings.
          </p>
          <div className="mt-4">
            <Link href="/admin/session/new">
              <Button>Create a session</Button>
            </Link>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map((s) => {
            const close = effectiveCloseAt(s.date, s.closeAt);
            const gate = s.isArchived ? "archived" : getBookingsGateState(s.openAt, close);
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
              >
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{s.name}</h2>
                    <GateBadge gate={gate} />
                  </div>
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    {formatMonthDay(s.date)} · {s.location}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Coach ${s.coachFee} · Gym ${s.gymFee}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/session/${s.id}`}>
                    <Button variant="secondary" size="sm">
                      Open
                    </Button>
                  </Link>
                  {!s.isArchived ? (
                    <form action={archiveSessionAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Archive
                      </Button>
                    </form>
                  ) : (
                    <form action={unarchiveSessionAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Reopen
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function GateBadge({ gate }: { gate: "open" | "pending" | "closed" | "archived" }) {
  const styles: Record<typeof gate, string> = {
    open: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
    pending: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
    closed: "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
    archived: "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
  };
  const label: Record<typeof gate, string> = {
    open: "Open",
    pending: "Pending",
    closed: "Closed",
    archived: "Archived",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[gate]}`}>
      {label[gate]}
    </span>
  );
}
