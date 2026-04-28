"use server";

import { redirect } from "next/navigation";
import { createBookingSchema, cancelBookingSchema } from "@/lib/validators";
import { createBooking, cancelBooking } from "@/lib/booking";
import { areBookingsOpen, getSettings } from "@/lib/settings";

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

  const settings = await getSettings();
  if (!areBookingsOpen(settings.bookingsOpenAt)) {
    return {
      ok: false,
      error: "Bookings are not open yet. Please wait until the countdown ends.",
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
  redirect(`/success?${params.toString()}`);
}

export async function cancelBookingAction(
  _prev: ActionResult<{ promoted: string | null }> | null,
  formData: FormData,
): Promise<ActionResult<{ promoted: string | null }>> {
  const parsed = cancelBookingSchema.safeParse({
    name: formData.get("name"),
    whatsapp: formData.get("whatsapp"),
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
  });

  if (!result.ok) {
    return {
      ok: false,
      error: "We couldn't find a booking matching that name and WhatsApp. Please double-check.",
    };
  }

  return {
    ok: true,
    data: { promoted: result.promoted?.name ?? null },
  };
}
