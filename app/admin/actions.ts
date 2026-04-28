"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, login, logout, changePassword } from "@/lib/auth";
import {
  adminLoginSchema,
  changePasswordSchema,
  settingsUpdateSchema,
  slotInputSchema,
  walkinBookingSchema,
} from "@/lib/validators";
import { updateSettings, getSettings } from "@/lib/settings";
import {
  createBooking,
  adminCancelBooking,
  markPaid,
  resetWeek,
} from "@/lib/booking";
import { parseISODate, nextSaturday, toISODate } from "@/lib/utils";
import { isPaymentMethod } from "@/lib/types";

export type AdminActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export async function loginAction(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  const parsed = adminLoginSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: "Password is required." };
  const ok = await login(parsed.data.password);
  if (!ok) return { ok: false, error: "Incorrect password." };
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

export async function updateSettingsAction(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = settingsUpdateSchema.safeParse({
    gymLocation: formData.get("gymLocation"),
    trainingDate: formData.get("trainingDate"),
    coachFee: formData.get("coachFee"),
    gymFee: formData.get("gymFee"),
    bookingsOpenAt: formData.get("bookingsOpenAt") ?? "",
    bookingsCloseAt: formData.get("bookingsCloseAt") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the values and try again." };
  }
  await updateSettings(parsed.data);
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, message: "Settings saved." };
}

export async function changePasswordAction(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid password.",
    };
  }
  const ok = await changePassword(parsed.data.currentPassword, parsed.data.newPassword);
  if (!ok) return { ok: false, error: "Current password is incorrect." };
  return { ok: true, message: "Password updated." };
}

const slotCrudSchema = slotInputSchema
  .extend({
    trainingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .partial({ order: true });

export async function upsertSlotAction(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const orderRaw = formData.get("order");
  const parsed = slotCrudSchema.safeParse({
    id: formData.get("id") || undefined,
    time: formData.get("time"),
    capacity: formData.get("capacity"),
    order: orderRaw === null || orderRaw === "" ? undefined : orderRaw,
    trainingDate: formData.get("trainingDate"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid slot." };
  }
  const date = parseISODate(parsed.data.trainingDate);
  try {
    if (parsed.data.id) {
      await prisma.slot.update({
        where: { id: parsed.data.id },
        data: {
          time: parsed.data.time,
          capacity: parsed.data.capacity,
          ...(parsed.data.order !== undefined ? { order: parsed.data.order } : {}),
          date,
        },
      });
    } else {
      let order = parsed.data.order;
      if (order === undefined) {
        const last = await prisma.slot.findFirst({
          where: { date },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        order = (last?.order ?? 0) + 1;
      }
      await prisma.slot.create({
        data: {
          time: parsed.data.time,
          capacity: parsed.data.capacity,
          order,
          date,
        },
      });
    }
  } catch {
    return { ok: false, error: "A slot with that time already exists for this date." };
  }
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, message: "Slot saved." };
}

export async function deleteSlotAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.slot.delete({ where: { id } });
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function markPaidAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const paid = formData.get("paid") === "true";
  if (!id) return;
  await markPaid(id, paid);
  revalidatePath("/admin");
}

export async function adminCancelAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await adminCancelBooking(id);
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function addWalkinAction(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = walkinBookingSchema.safeParse({
    slotId: formData.get("slotId"),
    name: formData.get("name"),
    whatsapp: formData.get("whatsapp"),
    email: formData.get("email") ?? undefined,
    uber: formData.get("uber") === "on" || formData.get("uber") === "true",
    payment: formData.get("payment") ?? "Cash",
    paid: formData.get("paid") === "on" || formData.get("paid") === "true",
    amount: formData.get("amount") || undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid booking." };
  }
  if (!isPaymentMethod(parsed.data.payment)) {
    return { ok: false, error: "Invalid payment method." };
  }
  const result = await createBooking({
    slotId: parsed.data.slotId,
    name: parsed.data.name,
    whatsapp: parsed.data.whatsapp,
    email: parsed.data.email,
    uber: parsed.data.uber,
    payment: parsed.data.payment,
    amount: parsed.data.amount,
    note: parsed.data.note,
    paid: parsed.data.paid,
  });
  if (!result.ok) {
    if (result.error === "DUPLICATE") return { ok: false, error: "Duplicate booking." };
    return { ok: false, error: "Slot not found." };
  }
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, message: `Added (${result.status}).` };
}

export async function resetWeekAction(): Promise<void> {
  await requireAdmin();
  // Advance to the Saturday after the current trainingDate.
  const settings = await getSettings();
  const next = new Date(settings.trainingDate);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextSat = nextSaturday(next);
  await resetWeek(toISODate(nextSat));
  revalidatePath("/admin");
  revalidatePath("/");
}
