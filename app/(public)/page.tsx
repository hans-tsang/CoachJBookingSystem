import Link from "next/link";
import { prisma } from "@/lib/db";
import { getBookingsGateState, getSettings } from "@/lib/settings";
import { formatMonthDay } from "@/lib/utils";
import { BookingForm } from "@/components/booking-form";
import { BookingsCountdown } from "@/components/bookings-countdown";
import { BookingsClosedNotice } from "@/components/bookings-closed-notice";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const settings = await getSettings();
  const gate = getBookingsGateState(settings.bookingsOpenAt, settings.bookingsCloseAt);

  const slots =
    gate === "open"
      ? await prisma.slot.findMany({
          where: { date: settings.trainingDate },
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
        <p className="text-sm font-medium uppercase tracking-wider text-[var(--color-brand)]">
          HYROX Training
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Saturday, {formatMonthDay(settings.trainingDate)}
        </h1>
        <p className="text-base text-[var(--color-muted-foreground)]">
          {settings.gymLocation}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-muted-foreground)]">
          <span>Coach Fee: ${settings.coachFee}</span>
          <span aria-hidden>·</span>
          <span>Gym Fee: ${settings.gymFee}</span>
        </div>
      </header>

      <section>
        {gate === "open" ? (
          <BookingForm slots={slotData} />
        ) : gate === "pending" && settings.bookingsOpenAt ? (
          <BookingsCountdown openAtISO={settings.bookingsOpenAt.toISOString()} />
        ) : (
          <BookingsClosedNotice
            closeAtISO={settings.bookingsCloseAt?.toISOString() ?? null}
          />
        )}
      </section>

      <footer className="border-t border-[var(--color-border)] pt-6 text-sm">
        <Link
          href="/cancel"
          className="text-[var(--color-muted-foreground)] underline-offset-4 hover:underline"
        >
          Need to cancel a booking?
        </Link>
      </footer>
    </main>
  );
}
