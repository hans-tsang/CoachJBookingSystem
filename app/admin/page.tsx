import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import {
  formatRoster,
  type SlotWithBookings,
  type RosterBooking,
} from "@/lib/roster";
import { toISODate } from "@/lib/utils";
import { AdminDashboard } from "@/components/admin-dashboard";
import type { AdminBookingRow } from "@/components/bookings-table";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");

  const settings = await getSettings();

  const slots = await prisma.slot.findMany({
    where: { date: settings.trainingDate },
    orderBy: { order: "asc" },
    include: {
      bookings: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const slotsForRoster: SlotWithBookings[] = slots.map((slot) => ({
    time: slot.time,
    capacity: slot.capacity,
    order: slot.order,
    bookings: slot.bookings.map<RosterBooking>((b) => ({
      name: b.name,
      uber: b.uber,
      status: b.status === "Waitlist" ? "Waitlist" : b.status === "Cancelled" ? "Cancelled" : "Confirmed",
      createdAt: b.createdAt,
    })),
  }));

  const rosterText = formatRoster(
    settings.trainingDate,
    settings.gymLocation,
    settings.coachFee,
    settings.gymFee,
    slotsForRoster,
  );

  // Note: the WhatsApp payment summary is now formatted on the client from the
  // bookings prop below, so it can refresh in real time when the Paid checkbox
  // is toggled in the admin Bookings table.
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
      rosterText={rosterText}
      bookings={bookings}
      slots={slots.map((s) => ({ id: s.id, time: s.time, capacity: s.capacity, order: s.order }))}
      settings={{
        gymLocation: settings.gymLocation,
        trainingDate: toISODate(settings.trainingDate),
        coachFee: settings.coachFee,
        gymFee: settings.gymFee,
        bookingsOpenAt: settings.bookingsOpenAt
          ? settings.bookingsOpenAt.toISOString()
          : "",
        bookingsCloseAt: settings.bookingsCloseAt
          ? settings.bookingsCloseAt.toISOString()
          : "",
      }}
    />
  );
}
