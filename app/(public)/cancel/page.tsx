import Link from "next/link";
import { CancelForm } from "@/components/cancel-form";
import { getSessionById } from "@/lib/session";
import { formatMonthDay } from "@/lib/utils";

type SearchParams = Promise<{ sessionId?: string }>;

export default async function CancelPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const sessionId = sp.sessionId?.trim() || undefined;
  const session = sessionId ? await getSessionById(sessionId) : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={session ? `/session/${session.id}` : "/"}
          className="text-sm text-[var(--color-muted-foreground)] underline-offset-4 hover:underline"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Cancel booking</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Enter the name and WhatsApp number used when you booked.
        </p>
      </header>
      {session ? (
        <div className="flex flex-col gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4 text-sm">
          <p className="font-medium">
            You&apos;re cancelling your booking for {session.name}
          </p>
          <p className="text-[var(--color-muted-foreground)]">
            on {formatMonthDay(session.date)} · {session.location}
          </p>
        </div>
      ) : (
        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4 text-sm text-[var(--color-muted-foreground)]">
          We&apos;ll cancel your most recent active booking for this name and
          WhatsApp number. If you have multiple active bookings, please open
          the specific session page and tap “Need to cancel a booking?” there.
        </p>
      )}
      <CancelForm sessionId={session ? session.id : undefined} />
    </main>
  );
}
