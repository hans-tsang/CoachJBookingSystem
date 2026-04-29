import { type Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { sendPromotionEmail } from "./email";
import { formatMonthDay } from "./utils";
import type { BookingStatus, PaymentMethod } from "./types";

type Tx = Prisma.TransactionClient | PrismaClient;

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
  return prisma.$transaction(async (tx) => {
    const slot = await tx.slot.findUnique({ where: { id: args.slotId } });
    if (!slot) return { ok: false, error: "SLOT_NOT_FOUND" } as const;

    // Duplicate detection: same slot + same digits-only whatsapp + case-insensitive name,
    // ignoring already-cancelled rows.
    const existing = await tx.booking.findMany({
      where: {
        slotId: args.slotId,
        whatsapp: args.whatsapp,
        status: { not: "Cancelled" },
      },
    });
    const lowerName = args.name.trim().toLowerCase();
    if (existing.some((b) => b.name.trim().toLowerCase() === lowerName)) {
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

    return { ok: true, status, bookingId: created.id, position } as const;
  });
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
      promoted: { bookingId: string; name: string; email: string | null; slotTime: string } | null;
      slotTime: string;
      sessionName: string;
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
      promoted,
      slotTime: match.slot.time,
      sessionName: match.slot.session.name,
    };
  });

  // Send promotion email outside the DB transaction; failures must not roll back the cancel.
  if (result.ok && result.promoted && result.promoted.email) {
    try {
      const slot = await prisma.slot.findFirst({
        where: { bookings: { some: { id: result.promoted.bookingId } } },
      });
      const dateLabel = slot ? formatMonthDay(slot.date) : "";
      await sendPromotionEmail(result.promoted.email, result.promoted.slotTime, dateLabel);
    } catch (err) {
       
      console.error("Failed to send promotion email", err);
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
  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.status === "Cancelled") return;
    const wasConfirmed = booking.status === "Confirmed";
    await tx.booking.update({ where: { id: bookingId }, data: { status: "Cancelled" } });
    await tx.auditLog.create({
      data: {
        action: "cancel",
        payload: JSON.stringify({ bookingId, slotId: booking.slotId, by: "admin" }),
      },
    });
    if (wasConfirmed) {
      await promoteWaitlist(booking.slotId, tx);
    }
  });
}
