import { z } from "zod";
import { normalizePhone } from "./phone";

export const PaymentMethodEnum = z.enum(["PayMe", "FPS", "Cash", "Other"]);
export const BookingStatusEnum = z.enum(["Confirmed", "Waitlist", "Cancelled"]);

const trimmedString = (max = 200) =>
  z
    .string()
    .trim()
    .min(1, "Required")
    .max(max, `Must be ${max} characters or fewer`);

const whatsappField = z
  .string()
  .trim()
  .min(1, "WhatsApp is required")
  .transform((v) => normalizePhone(v))
  .refine((v) => v.length >= 6 && v.length <= 20, {
    message: "Enter a valid WhatsApp number",
  });

export const createBookingSchema = z.object({
  slotId: z.string().min(1, "Please choose a slot"),
  name: trimmedString(120),
  whatsapp: whatsappField,
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(200)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  uber: z.coerce.boolean().default(false),
  payment: PaymentMethodEnum.default("PayMe"),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({
  name: trimmedString(120),
  whatsapp: whatsappField,
  sessionId: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const adminLoginSchema = z.object({
  password: z.string().min(1, "Password is required").max(200),
});

export const sessionInputSchema = z
  .object({
    name: trimmedString(120),
    location: trimmedString(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    coachFee: z.coerce.number().int().min(0).max(100000),
    gymFee: z.coerce.number().int().min(0).max(100000),
    // ISO 8601 datetime string in UTC. Empty string = no gate.
    openAt: z
      .string()
      .trim()
      .max(64)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : ""))
      .refine(
        (v) => v === "" || !Number.isNaN(new Date(v).getTime()),
        { message: "Enter a valid date/time" },
      ),
    closeAt: z
      .string()
      .trim()
      .max(64)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : ""))
      .refine(
        (v) => v === "" || !Number.isNaN(new Date(v).getTime()),
        { message: "Enter a valid date/time" },
      ),
  })
  .refine(
    (data) => {
      if (!data.openAt || !data.closeAt) return true;
      const open = new Date(data.openAt).getTime();
      const close = new Date(data.closeAt).getTime();
      return close > open;
    },
    { message: "Closing time must be after opening time", path: ["closeAt"] },
  );

export type SessionInput = z.infer<typeof sessionInputSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
  })
  .strict();

export const slotInputSchema = z.object({
  id: z.string().optional(),
  sessionId: z.string().min(1, "Session is required"),
  time: z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/, "Use HH:MM-HH:MM"),
  capacity: z.coerce.number().int().min(1).max(200),
  order: z.coerce.number().int().min(0).max(1000),
});

export const walkinBookingSchema = createBookingSchema.extend({
  paid: z.coerce.boolean().default(false),
  amount: z.coerce.number().int().min(0).max(100000).optional(),
  note: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});
