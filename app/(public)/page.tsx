import Link from "next/link";
import { prisma } from "@/lib/db";
import { getActiveSessions } from "@/lib/session";
import { effectiveCloseAt, getBookingsGateState } from "@/lib/settings";
import { formatMonthDay } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SessionCard = {
  id: string;
  name: string;
  location: string;
  date: Date;
  coachFee: number;
  gymFee: number;
  gate: "open" | "pending" | "closed";
  openAt: Date | null;
  closeAt: Date;
  totalCapacity: number;
  totalConfirmed: number;
  totalWaitlist: number;
};

async function loadCards(): Promise<SessionCard[]> {
  const sessions = await getActiveSessions();
  if (sessions.length === 0) return [];
  const slots = await prisma.slot.findMany({
    where: { sessionId: { in: sessions.map((s) => s.id) } },
    include: {
      bookings: {
        where: { status: { not: "Cancelled" } },
        select: { status: true },
      },
    },
  });
  return sessions.map((s) => {
    const sessionSlots = slots.filter((sl) => sl.sessionId === s.id);
    const totalCapacity = sessionSlots.reduce((sum, sl) => sum + sl.capacity, 0);
    let totalConfirmed = 0;
    let totalWaitlist = 0;
    for (const sl of sessionSlots) {
      for (const b of sl.bookings) {
        if (b.status === "Confirmed") totalConfirmed++;
        else if (b.status === "Waitlist") totalWaitlist++;
      }
    }
    const close = effectiveCloseAt(s.date, s.closeAt);
    return {
      id: s.id,
      name: s.name,
      location: s.location,
      date: s.date,
      coachFee: s.coachFee,
      gymFee: s.gymFee,
      openAt: s.openAt,
      closeAt: close,
      gate: getBookingsGateState(s.openAt, close),
      totalCapacity,
      totalConfirmed,
      totalWaitlist,
    };
  });
}

function gateBadge(gate: SessionCard["gate"]) {
  if (gate === "open") {
    return (
      <span className="rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-success)]">
        Bookings open
      </span>
    );
  }
  if (gate === "pending") {
    return (
      <span className="rounded-full bg-[var(--color-warning)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-warning)]">
        Opens soon
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs font-medium text-[var(--color-muted-foreground)]">
      Closed
    </span>
  );
}

export default async function HomePage() {
  const cards = await loadCards();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:gap-4 sm:text-left">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://github.com/user-attachments/assets/ad521e25-50f7-4cde-a660-775ff78e0b88"
          alt="Coach J's Hyrox Training Club logo"
          width={96}
          height={96}
          className="h-24 w-24 rounded-md object-contain"
        />
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-wider text-[var(--color-brand)]">
            Coach J&apos;s Hyrox Training Club
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Upcoming sessions
          </h1>
          <p className="text-base text-[var(--color-muted-foreground)]">
            Pick a session below to book your spot.
          </p>
        </div>
      </header>

      <section>
        {cards.length === 0 ? (
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
            No sessions are available yet. Please check back soon.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {cards.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-brand)]">
                      {c.name}
                    </p>
                    <h2 className="text-lg font-semibold">
                      {formatMonthDay(c.date)} · {c.location}
                    </h2>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      Coach Fee: ${c.coachFee} · Gym Fee: ${c.gymFee}
                    </p>
                    {c.totalCapacity > 0 ? (
                      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                        {c.totalConfirmed} / {c.totalCapacity} confirmed
                        {c.totalWaitlist > 0 ? ` · ${c.totalWaitlist} on waitlist` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {gateBadge(c.gate)}
                    <Link
                      href={`/session/${c.id}`}
                      className="rounded-md bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                    >
                      View &amp; book
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="border-t border-[var(--color-border)] pt-6 text-sm text-[var(--color-muted-foreground)]">
        <a
          href="https://www.instagram.com/coachjunvie/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
        >
          <span aria-hidden="true">📸</span>
          Follow @coachjunvie on Instagram
        </a>
      </footer>

    </main>
  );
}
