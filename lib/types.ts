// Domain enums — kept as string union types because SQLite does not support
// native enums in Prisma 5. The DB stores strings; we narrow at the boundaries.

export const BOOKING_STATUSES = ["Confirmed", "Waitlist", "Cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_METHODS = ["PayMe", "FPS", "Cash", "Other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isBookingStatus(v: string): v is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(v);
}

export function isPaymentMethod(v: string): v is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(v);
}
