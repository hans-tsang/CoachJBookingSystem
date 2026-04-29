import { notFound, redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSessionById } from "@/lib/session";
import { formatRoster, type SlotWithBookings } from "@/lib/roster";
import { toISODate } from "@/lib/utils";
import { AdminDashboard } from "@/components/admin-dashboard";
import type { AdminBookingRow } from "@/components/bookings-table";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function AdminSessionPage({ params }: { params: Params }) {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const { id } = await params;
  const session = await getSessionById(id);
  if (!session) notFound();

  const slots = await prisma.slot.findMany({
    where: { sessionId: session.id },
    orderBy: { order: "asc" },
    include: { bookings: { orderBy: { createdAt: "asc" } } },
  });

  const slotWithBookings: SlotWithBookings[] = slots.map((slot) => ({
    time: slot.time,
    capacity: slot.capacity,
    order: slot.order,
    bookings: slot.bookings.map((b) => ({
      name: b.name,
      uber: b.uber,
      status: b.status as "Confirmed" | "Waitlist" | "Cancelled",
      createdAt: b.createdAt,
    })),
  }));

  const rosterText = formatRoster(
    session.name,
    session.date,
    session.location,
    session.coachFee,
    session.gymFee,
    slotWithBookings,
  );

  const bookings: AdminBookingRow[] = slots.flatMap((slot) =>
    slot.bookings.map((b) => ({
      id: b.id,
      slotTime: slot.time,
      name: b.name,
      whatsapp: b.whatsapp,
      email: b.email,
      uber: b.uber,
      payment: b.payment,
      amount: b.amount,
      paid: b.paid,
      status: b.status,
      note: b.note,
      createdAt: b.createdAt.toISOString(),
    })),
  );

  return (
    <AdminDashboard
      sessionId={session.id}
      rosterText={rosterText}
      bookings={bookings}
      slots={slots.map((s) => ({
        id: s.id,
        time: s.time,
        capacity: s.capacity,
        order: s.order,
      }))}
      session={{
        name: session.name,
        location: session.location,
        date: toISODate(session.date),
        coachFee: session.coachFee,
        gymFee: session.gymFee,
        openAt: session.openAt ? session.openAt.toISOString() : "",
        closeAt: session.closeAt ? session.closeAt.toISOString() : "",
        isArchived: session.isArchived,
      }}
    />
  );
}
