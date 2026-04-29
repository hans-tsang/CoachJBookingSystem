"use server";

import { redirect } from "next/navigation";
import { createBookingSchema, cancelBookingSchema } from "@/lib/validators";
import { createBooking, cancelBooking } from "@/lib/booking";
import { prisma } from "@/lib/db";
import { getBookingsGateState, effectiveCloseAt } from "@/lib/settings";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createBookingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createBookingSchema.safeParse({
    slotId: formData.get("slotId"),
    name: formData.get("name"),
    whatsapp: formData.get("whatsapp"),
    email: formData.get("email") ?? undefined,
    uber: formData.get("uber") === "on" || formData.get("uber") === "true",
    payment: formData.get("payment") ?? "PayMe",
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check your details and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // Resolve the session for this slot to evaluate the booking gate.
  const slot = await prisma.slot.findUnique({
    where: { id: parsed.data.slotId },
    include: { session: true },
  });
  if (!slot) {
    return { ok: false, error: "That slot is no longer available. Please pick another." };
  }
  if (slot.session.isArchived) {
    return { ok: false, error: "This session is no longer accepting bookings." };
  }
  const gate = getBookingsGateState(
    slot.session.openAt,
    effectiveCloseAt(slot.session.date, slot.session.closeAt),
  );
  if (gate === "pending") {
    return {
      ok: false,
      error: "Bookings are not open yet. Please wait until the countdown ends.",
    };
  }
  if (gate === "closed") {
    return {
      ok: false,
      error: "Bookings have closed for this session.",
    };
  }

  const result = await createBooking({
    slotId: parsed.data.slotId,
    name: parsed.data.name,
    whatsapp: parsed.data.whatsapp,
    email: parsed.data.email,
    uber: parsed.data.uber,
    payment: parsed.data.payment,
  });

  if (!result.ok) {
    if (result.error === "DUPLICATE") {
      return {
        ok: false,
        error: "You've already booked this slot. If you need help, please contact Coach J.",
      };
    }
    return { ok: false, error: "That slot is no longer available. Please pick another." };
  }

  const params = new URLSearchParams({
    status: result.status,
    position: String(result.position),
    name: parsed.data.name,
  });
  redirect(`/session/${slot.sessionId}/success?${params.toString()}`);
}

export async function cancelBookingAction(
  _prev: ActionResult<{
    promoted: string | null;
    sessionName: string;
    slotTime: string;
  }> | null,
  formData: FormData,
): Promise<
  ActionResult<{ promoted: string | null; sessionName: string; slotTime: string }>
> {
  const parsed = cancelBookingSchema.safeParse({
    name: formData.get("name"),
    whatsapp: formData.get("whatsapp"),
    sessionId: formData.get("sessionId") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please enter your name and WhatsApp number.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = await cancelBooking({
    name: parsed.data.name,
    whatsapp: parsed.data.whatsapp,
    sessionId: parsed.data.sessionId,
  });

  if (!result.ok) {
    if (result.error === "MULTIPLE_MATCHES") {
      return {
        ok: false,
        error:
          "You have more than one active booking with that name and WhatsApp number. Please open the specific session page and tap “Need to cancel a booking?” there so we know which one to cancel.",
      };
    }
    return {
      ok: false,
      error: "We couldn't find a booking matching that name and WhatsApp. Please double-check.",
    };
  }

  return {
    ok: true,
    data: {
      promoted: result.promoted?.name ?? null,
      sessionName: result.sessionName,
      slotTime: result.slotTime,
    },
  };
}
