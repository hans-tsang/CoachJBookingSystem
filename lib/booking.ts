import { type Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { sendBookingConfirmationEmail, sendCancellationEmail, sendPromotionEmail } from "./email";
import { getEventInstants, type CalendarEvent } from "./calendar";
import { formatMonthDay } from "./utils";
import type { BookingStatus, PaymentMethod } from "./types";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Build the CalendarEvent passed to confirmation/promotion emails. Returns
 * null when the slot's time string can't be parsed — in that case the email
 * is still sent but without add-to-calendar links.
 */
function buildSlotCalendarEvent(args: {
  sessionName: string;
  location: string;
  slotDate: Date;
  slotTime: string;
}): CalendarEvent | null {
  const instants = getEventInstants(args.slotDate, args.slotTime);
  if (!instants) return null;
  return {
    title: `${args.sessionName} with Coach Junvie`,
    description: `${args.sessionName} with Coach Junvie at ${args.location}`,
    location: args.location,
    start: instants.start,
    end: instants.end,
  };
}

export type CreateBookingArgs = {
  slotId: string;
  name: string;
  whatsapp: string; // already digits-only normalized
  email?: string;
  uber: boolean;
  payment: PaymentMethod;
  amount?: number;
  note?: string;
  paid?: boolean;
};

export type CreateBookingResult =
  | { ok: true; status: "Confirmed" | "Waitlist"; bookingId: string; position: number }
  | { ok: false; error: "DUPLICATE" | "SLOT_NOT_FOUND" };

export async function createBooking(args: CreateBookingArgs): Promise<CreateBookingResult> {
  const result = await prisma.$transaction(async (tx) => {
    const slot = await tx.slot.findUnique({
      where: { id: args.slotId },
      include: { session: true },
    });
    if (!slot) return { ok: false, error: "SLOT_NOT_FOUND" } as const;

    // One person, one whatsapp per session: reject if this whatsapp already
    // has any non-cancelled booking on any slot in the same session.
    const existing = await tx.booking.findFirst({
      where: {
        whatsapp: args.whatsapp,
        status: { not: "Cancelled" },
        slot: { sessionId: slot.sessionId },
      },
    });
    if (existing) {
      return { ok: false, error: "DUPLICATE" } as const;
    }

    const confirmedCount = await tx.booking.count({
      where: { slotId: args.slotId, status: "Confirmed" },
    });

    const status: "Confirmed" | "Waitlist" =
      confirmedCount < slot.capacity ? "Confirmed" : "Waitlist";

    const created = await tx.booking.create({
      data: {
        slotId: args.slotId,
        name: args.name.trim(),
        whatsapp: args.whatsapp,
        email: args.email,
        uber: args.uber,
        payment: args.payment,
        amount: args.amount,
        paid: args.paid ?? false,
        note: args.note,
        status,
      },
    });

    let position = 1;
    if (status === "Confirmed") {
      position = confirmedCount + 1;
    } else {
      position = await tx.booking.count({
        where: {
          slotId: args.slotId,
          status: "Waitlist",
          createdAt: { lte: created.createdAt },
        },
      });
    }

    await tx.auditLog.create({
      data: {
        action: "book",
        payload: JSON.stringify({
          bookingId: created.id,
          slotId: args.slotId,
          name: created.name,
          status,
        }),
      },
    });

    return {
      ok: true as const,
      status,
      bookingId: created.id,
      position,
      email: created.email,
      slotTime: slot.time,
      slotDate: slot.date,
      sessionName: slot.session.name,
      location: slot.session.location,
    };
  });

  // Send confirmation email outside the DB transaction; failures must not roll
  // back the booking. Only sends when the booker provided an email address.
  if (result.ok && result.email) {
    try {
      const dateLabel = formatMonthDay(result.slotDate);
      const calendarEvent =
        result.status === "Confirmed"
          ? buildSlotCalendarEvent({
              sessionName: result.sessionName,
              location: result.location,
              slotDate: result.slotDate,
              slotTime: result.slotTime,
            })
          : null;
      await sendBookingConfirmationEmail(
        result.email,
        result.status,
        result.slotTime,
        dateLabel,
        result.sessionName,
        result.status === "Waitlist" ? result.position : undefined,
        calendarEvent,
      );
    } catch (err) {
      console.error("Failed to send booking confirmation email", err);
    }
  }

  if (!result.ok) return result;
  return {
    ok: true,
    status: result.status,
    bookingId: result.bookingId,
    position: result.position,
  };
}

export type CancelBookingArgs = {
  name: string;
  whatsapp: string; // digits-only
  sessionId?: string;
};

export type CancelBookingResult =
  | {
      ok: true;
      cancelledStatus: BookingStatus;
      cancelledEmail: string | null;
      promoted: { bookingId: string; name: string; email: string | null; slotTime: string } | null;
      slotTime: string;
      slotDate: Date;
      sessionName: string;
      location: string;
    }
  | { ok: false; error: "NOT_FOUND" | "MULTIPLE_MATCHES" };

export async function cancelBooking(args: CancelBookingArgs): Promise<CancelBookingResult> {
  const lowerName = args.name.trim().toLowerCase();

  const result = await prisma.$transaction(async (tx) => {
    const candidates = await tx.booking.findMany({
      where: {
        whatsapp: args.whatsapp,
        status: { not: "Cancelled" },
        ...(args.sessionId ? { slot: { sessionId: args.sessionId } } : {}),
      },
      include: { slot: { include: { session: true } } },
      orderBy: { createdAt: "desc" },
    });

    const matches = candidates.filter(
      (b) => b.name.trim().toLowerCase() === lowerName,
    );
    if (matches.length === 0) return { ok: false, error: "NOT_FOUND" } as const;
    // If the caller didn't scope to a specific session and multiple active
    // bookings match, refuse to guess — let the UI ask the user to cancel
    // from the specific session page.
    if (matches.length > 1 && !args.sessionId) {
      return { ok: false, error: "MULTIPLE_MATCHES" } as const;
    }
    const match = matches[0];

    const wasConfirmed = match.status === "Confirmed";

    await tx.booking.update({
      where: { id: match.id },
      data: { status: "Cancelled" },
    });

    await tx.auditLog.create({
      data: {
        action: "cancel",
        payload: JSON.stringify({
          bookingId: match.id,
          slotId: match.slotId,
          previousStatus: match.status,
        }),
      },
    });

    let promoted: {
      bookingId: string;
      name: string;
      email: string | null;
      slotTime: string;
    } | null = null;

    if (wasConfirmed) {
      const oldestWaitlist = await tx.booking.findFirst({
        where: { slotId: match.slotId, status: "Waitlist" },
        orderBy: { createdAt: "asc" },
      });
      if (oldestWaitlist) {
        await tx.booking.update({
          where: { id: oldestWaitlist.id },
          data: { status: "Confirmed" },
        });
        await tx.auditLog.create({
          data: {
            action: "promote",
            payload: JSON.stringify({
              bookingId: oldestWaitlist.id,
              slotId: match.slotId,
              triggeredBy: match.id,
            }),
          },
        });
        promoted = {
          bookingId: oldestWaitlist.id,
          name: oldestWaitlist.name,
          email: oldestWaitlist.email,
          slotTime: match.slot.time,
        };
      }
    }

    return {
      ok: true as const,
      cancelledStatus: match.status as BookingStatus,
      cancelledEmail: match.email,
      promoted,
      slotTime: match.slot.time,
      slotDate: match.slot.date,
      sessionName: match.slot.session.name,
      location: match.slot.session.location,
    };
  });

  // Send emails outside the DB transaction; failures must not roll back the cancel.
  if (result.ok) {
    if (result.cancelledEmail) {
      try {
        const dateLabel = formatMonthDay(result.slotDate);
        await sendCancellationEmail(
          result.cancelledEmail,
          result.slotTime,
          dateLabel,
          result.sessionName,
          false,
        );
      } catch (err) {
         
        console.error("Failed to send cancellation email", err);
      }
    }
    if (result.promoted && result.promoted.email) {
      try {
        const dateLabel = formatMonthDay(result.slotDate);
        const calendarEvent = buildSlotCalendarEvent({
          sessionName: result.sessionName,
          location: result.location,
          slotDate: result.slotDate,
          slotTime: result.promoted.slotTime,
        });
        await sendPromotionEmail(
          result.promoted.email,
          result.promoted.slotTime,
          dateLabel,
          result.sessionName,
          calendarEvent,
        );
      } catch (err) {
         
        console.error("Failed to send promotion email", err);
      }
    }
  }

  return result;
}

/** Promote oldest waitlist for a slot. Useful when an admin manually cancels. */
export async function promoteWaitlist(
  slotId: string,
  tx: Tx = prisma,
): Promise<{ promotedId: string | null }> {
  const oldest = await tx.booking.findFirst({
    where: { slotId, status: "Waitlist" },
    orderBy: { createdAt: "asc" },
  });
  if (!oldest) return { promotedId: null };
  await tx.booking.update({ where: { id: oldest.id }, data: { status: "Confirmed" } });
  await tx.auditLog.create({
    data: {
      action: "promote",
      payload: JSON.stringify({ bookingId: oldest.id, slotId }),
    },
  });
  return { promotedId: oldest.id };
}

/** Mark a booking as paid (or unpaid). Always writes an audit log entry. */
export async function markPaid(bookingId: string, paid: boolean): Promise<void> {
  await prisma.$transaction([
    prisma.booking.update({ where: { id: bookingId }, data: { paid } }),
    prisma.auditLog.create({
      data: { action: "markPaid", payload: JSON.stringify({ bookingId, paid }) },
    }),
  ]);
}

/** Admin-initiated cancel (no name/whatsapp match). Promotes waitlist if needed. */
export async function adminCancelBooking(bookingId: string): Promise<void> {
  let promotedId: string | null = null;
  type CancelledInfo = {
    email: string;
    slotTime: string;
    slotDate: Date;
    sessionName: string;
  };
  let cancelledInfo: CancelledInfo | null = null;

  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { slot: { include: { session: true } } },
    });
    if (!booking || booking.status === "Cancelled") return;
    const wasConfirmed = booking.status === "Confirmed";
    await tx.booking.update({ where: { id: bookingId }, data: { status: "Cancelled" } });
    await tx.auditLog.create({
      data: {
        action: "cancel",
        payload: JSON.stringify({ bookingId, slotId: booking.slotId, by: "admin" }),
      },
    });
    if (booking.email) {
      cancelledInfo = {
        email: booking.email,
        slotTime: booking.slot.time,
        slotDate: booking.slot.date,
        sessionName: booking.slot.session.name,
      };
    }
    if (wasConfirmed) {
      const result = await promoteWaitlist(booking.slotId, tx);
      promotedId = result.promotedId;
    }
  });

  // Send cancellation email to the cancelled user outside the DB transaction;
  // failures must not roll back the cancel.
  // The transaction has fully run by here; TS cannot narrow values written
  // inside the closure, so use an explicit non-null check + locals.
  if (cancelledInfo !== null) {
    const info: CancelledInfo = cancelledInfo;
    try {
      const dateLabel = formatMonthDay(info.slotDate);
      await sendCancellationEmail(
        info.email,
        info.slotTime,
        dateLabel,
        info.sessionName,
        true,
      );
    } catch (err) {
      console.error("Failed to send cancellation email after admin cancel", err);
    }
  }

  // Send promotion email outside the DB transaction; failures must not roll back the cancel.
  if (promotedId) {
    try {
      const promoted = await prisma.booking.findUnique({
        where: { id: promotedId },
        include: { slot: { include: { session: true } } },
      });
      if (promoted?.email) {
        const dateLabel = formatMonthDay(promoted.slot.date);
        const calendarEvent = buildSlotCalendarEvent({
          sessionName: promoted.slot.session.name,
          location: promoted.slot.session.location,
          slotDate: promoted.slot.date,
          slotTime: promoted.slot.time,
        });
        await sendPromotionEmail(
          promoted.email,
          promoted.slot.time,
          dateLabel,
          promoted.slot.session.name,
          calendarEvent,
        );
      }
    } catch (err) {
      console.error("Failed to send promotion email after admin cancel", err);
    }
  }
}
