"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, login, logout, changePassword } from "@/lib/auth";
import {
  adminLoginSchema,
  changePasswordSchema,
  sessionInputSchema,
  slotInputSchema,
  walkinBookingSchema,
} from "@/lib/validators";
import {
  createSession,
  updateSession,
  archiveSession,
} from "@/lib/session";
import { createBooking, adminCancelBooking, markPaid } from "@/lib/booking";
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

// ---------- Session CRUD ----------

function parseSessionForm(formData: FormData) {
  return sessionInputSchema.safeParse({
    name: formData.get("name"),
    location: formData.get("location"),
    date: formData.get("date"),
    coachFee: formData.get("coachFee"),
    gymFee: formData.get("gymFee"),
    openAt: formData.get("openAt") ?? "",
    closeAt: formData.get("closeAt") ?? "",
  });
}

export async function createSessionAction(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = parseSessionForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid session." };
  }
  const created = await createSession(parsed.data);
  revalidatePath("/admin");
  revalidatePath("/");
  redirect(`/admin/session/${created.id}`);
}

export async function updateSessionAction(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing session id." };
  const parsed = parseSessionForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid session." };
  }
  await updateSession(id, parsed.data);
  revalidatePath("/admin");
  revalidatePath(`/admin/session/${id}`);
  revalidatePath("/");
  revalidatePath(`/session/${id}`);
  return { ok: true, message: "Session saved." };
}

export async function archiveSessionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await archiveSession(id);
  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin");
}

// ---------- Slot CRUD ----------

const slotCrudSchema = slotInputSchema.partial({ order: true });

export async function upsertSlotAction(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const orderRaw = formData.get("order");
  const parsed = slotCrudSchema.safeParse({
    id: formData.get("id") || undefined,
    sessionId: formData.get("sessionId"),
    time: formData.get("time"),
    capacity: formData.get("capacity"),
    order: orderRaw === null || orderRaw === "" ? undefined : orderRaw,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid slot." };
  }
  const session = await prisma.session.findUnique({ where: { id: parsed.data.sessionId } });
  if (!session) return { ok: false, error: "Session not found." };

  try {
    if (parsed.data.id) {
      await prisma.slot.update({
        where: { id: parsed.data.id },
        data: {
          time: parsed.data.time,
          capacity: parsed.data.capacity,
          ...(parsed.data.order !== undefined ? { order: parsed.data.order } : {}),
          date: session.date,
        },
      });
    } else {
      let order = parsed.data.order;
      if (order === undefined) {
        const last = await prisma.slot.findFirst({
          where: { sessionId: parsed.data.sessionId },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        order = (last?.order ?? 0) + 1;
      }
      await prisma.slot.create({
        data: {
          sessionId: parsed.data.sessionId,
          time: parsed.data.time,
          capacity: parsed.data.capacity,
          order,
          date: session.date,
        },
      });
    }
  } catch {
    return { ok: false, error: "A slot with that time already exists for this session." };
  }
  revalidatePath(`/admin/session/${parsed.data.sessionId}`);
  revalidatePath(`/session/${parsed.data.sessionId}`);
  revalidatePath("/");
  return { ok: true, message: "Slot saved." };
}

export async function deleteSlotAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const slot = await prisma.slot.findUnique({ where: { id } });
  if (!slot) return;
  await prisma.slot.delete({ where: { id } });
  revalidatePath(`/admin/session/${slot.sessionId}`);
  revalidatePath(`/session/${slot.sessionId}`);
  revalidatePath("/");
}

// ---------- Booking actions (unchanged behaviour) ----------

export async function markPaidAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const paid = formData.get("paid") === "true";
  if (!id) return;
  await markPaid(id, paid);
  const sessionIdHint = String(formData.get("sessionId") ?? "");
  if (sessionIdHint) revalidatePath(`/admin/session/${sessionIdHint}`);
}

export async function adminCancelAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { slot: true },
  });
  await adminCancelBooking(id);
  if (booking) {
    revalidatePath(`/admin/session/${booking.slot.sessionId}`);
    revalidatePath(`/session/${booking.slot.sessionId}`);
  }
  revalidatePath("/");
}

const walkinSchemaWithSlot = walkinBookingSchema.extend({
  slotId: z.string().min(1, "Please choose a slot"),
});

export async function addWalkinAction(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = walkinSchemaWithSlot.safeParse({
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
  const slot = await prisma.slot.findUnique({ where: { id: parsed.data.slotId } });
  if (slot) {
    revalidatePath(`/admin/session/${slot.sessionId}`);
    revalidatePath(`/session/${slot.sessionId}`);
  }
  revalidatePath("/");
  return { ok: true, message: `Added (${result.status}).` };
}
