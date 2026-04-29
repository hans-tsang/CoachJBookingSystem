import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionById } from "@/lib/session";
import { effectiveCloseAt, getBookingsGateState } from "@/lib/settings";
import { formatMonthDay } from "@/lib/utils";
import { BookingForm } from "@/components/booking-form";
import { BookingsCountdown } from "@/components/bookings-countdown";
import { BookingsClosingCountdown } from "@/components/bookings-closing-countdown";
import { BookingsClosedNotice } from "@/components/bookings-closed-notice";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function SessionPage({ params }: { params: Params }) {
  const { id } = await params;
  const session = await getSessionById(id);
  if (!session || session.isArchived) notFound();

  const closeAt = effectiveCloseAt(session.date, session.closeAt);
  const gate = getBookingsGateState(session.openAt, closeAt);

  const slots =
    gate === "open"
      ? await prisma.slot.findMany({
          where: { sessionId: session.id },
          orderBy: { order: "asc" },
          include: {
            bookings: {
              where: { status: { not: "Cancelled" } },
              select: { status: true },
            },
          },
        })
      : [];

  const slotData = slots.map((slot) => ({
    id: slot.id,
    time: slot.time,
    capacity: slot.capacity,
    confirmedCount: slot.bookings.filter((b) => b.status === "Confirmed").length,
    waitlistCount: slot.bookings.filter((b) => b.status === "Waitlist").length,
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/"
          className="text-sm text-[var(--color-muted-foreground)] underline-offset-4 hover:underline"
        >
          ← All sessions
        </Link>
        <p className="text-sm font-medium uppercase tracking-wider text-[var(--color-brand)]">
          {session.name}
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {formatMonthDay(session.date)}
        </h1>
        <p className="text-base text-[var(--color-muted-foreground)]">
          {session.location}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-muted-foreground)]">
          <span>Coach Fee: ${session.coachFee}</span>
          <span aria-hidden>·</span>
          <span>Gym Fee: ${session.gymFee}</span>
        </div>
      </header>

      <section>
        {gate === "open" ? (
          <div className="flex flex-col gap-4">
            <BookingsClosingCountdown closeAtISO={closeAt.toISOString()} />
            <BookingForm slots={slotData} />
          </div>
        ) : gate === "pending" && session.openAt ? (
          <BookingsCountdown openAtISO={session.openAt.toISOString()} />
        ) : (
          <BookingsClosedNotice closeAtISO={closeAt.toISOString()} />
        )}
      </section>

      <footer className="border-t border-[var(--color-border)] pt-6 text-sm">
        <Link
          href={`/cancel?sessionId=${session.id}`}
          className="text-[var(--color-muted-foreground)] underline-offset-4 hover:underline"
        >
          Need to cancel a booking?
        </Link>
      </footer>
    </main>
  );
}
