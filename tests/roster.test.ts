import { describe, it, expect } from "vitest";
import {
  formatRoster,
  formatPaymentSummary,
  parseTimeLabel,
  type SlotWithBookings,
  type PaymentBooking,
} from "@/lib/roster";

const baseTime = new Date("2025-01-01T00:00:00Z").getTime();
const t = (offsetSec: number) => new Date(baseTime + offsetSec * 1000);

describe("parseTimeLabel", () => {
  it("parses HH:MM-HH:MM", () => {
    expect(parseTimeLabel("09:30-11:00")).toEqual({ startMin: 570, endMin: 660 });
  });

  it("returns null on invalid", () => {
    expect(parseTimeLabel("nope")).toBeNull();
  });
});

describe("formatRoster", () => {
  const date = new Date(Date.UTC(2025, 0, 4)); // Sat Jan 04 2025

  it("renders full slot with FULL marker and waitlist", () => {
    const slots: SlotWithBookings[] = [
      {
        time: "09:30-11:00",
        capacity: 3,
        order: 1,
        bookings: [
          { name: "Alice", uber: false, status: "Confirmed", createdAt: t(1) },
          { name: "Bob", uber: true, status: "Confirmed", createdAt: t(2) },
          { name: "Carol", uber: false, status: "Confirmed", createdAt: t(3) },
          { name: "Dan", uber: false, status: "Waitlist", createdAt: t(4) },
          { name: "Eve", uber: true, status: "Waitlist", createdAt: t(5) },
        ],
      },
    ];
    const out = formatRoster(date, "Coach J Gym", 150, 100, slots);
    expect(out).toMatchInlineSnapshot(`
      "*HYROX training on Jan 04*

      **Location:** Coach J Gym

      Coach Training Fee - $150
      Gym Fee - $100

      *(09:30-11:00)* 
      1. Alice
      2. Bob (Uber)
      3. Carol
      ***FULL***

      Waiting list:
      Dan
      Eve (Uber)"
    `);
  });

  it("renders partial slot with blank numbered lines and no FULL marker", () => {
    const slots: SlotWithBookings[] = [
      {
        time: "11:30-13:00",
        capacity: 4,
        order: 1,
        bookings: [
          { name: "Alice", uber: false, status: "Confirmed", createdAt: t(1) },
          { name: "Bob", uber: false, status: "Confirmed", createdAt: t(2) },
        ],
      },
    ];
    const out = formatRoster(date, "Gym", 150, 100, slots);
    expect(out).toContain("1. Alice");
    expect(out).toContain("2. Bob");
    expect(out).toContain("3. ");
    expect(out).toContain("4. ");
    expect(out).not.toContain("***FULL***");
    expect(out).not.toContain("Waiting list:");
  });

  it("orders multiple slots by .order and ignores cancelled bookings", () => {
    const slots: SlotWithBookings[] = [
      {
        time: "13:30-15:00",
        capacity: 2,
        order: 2,
        bookings: [{ name: "Zoe", uber: false, status: "Confirmed", createdAt: t(10) }],
      },
      {
        time: "09:30-11:00",
        capacity: 2,
        order: 1,
        bookings: [
          { name: "Alice", uber: false, status: "Confirmed", createdAt: t(1) },
          { name: "Ghost", uber: false, status: "Cancelled", createdAt: t(2) },
        ],
      },
    ];
    const out = formatRoster(date, "Gym", 150, 100, slots);
    expect(out.indexOf("09:30-11:00")).toBeLessThan(out.indexOf("13:30-15:00"));
    expect(out).not.toContain("Ghost");
  });

  it("orders confirmed by createdAt ASC regardless of input order", () => {
    const slots: SlotWithBookings[] = [
      {
        time: "09:30-11:00",
        capacity: 3,
        order: 1,
        bookings: [
          { name: "Third", uber: false, status: "Confirmed", createdAt: t(30) },
          { name: "First", uber: false, status: "Confirmed", createdAt: t(10) },
          { name: "Second", uber: false, status: "Confirmed", createdAt: t(20) },
        ],
      },
    ];
    const out = formatRoster(date, "Gym", 150, 100, slots);
    const firstIdx = out.indexOf("First");
    const secondIdx = out.indexOf("Second");
    const thirdIdx = out.indexOf("Third");
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });
});

describe("formatPaymentSummary", () => {
  const date = new Date(Date.UTC(2025, 3, 25)); // Apr 25 2025

  it("renders header, fees, and per-person totals with paid ticks and uber breakdown", () => {
    const bookings: PaymentBooking[] = [
      { name: "Aiko", uber: false, paid: true, amount: null, status: "Confirmed", createdAt: t(1) },
      { name: "Pats", uber: true, paid: true, amount: 232, status: "Confirmed", createdAt: t(2) },
      { name: "Natalia", uber: true, paid: false, amount: 232, status: "Confirmed", createdAt: t(3) },
      { name: "Mandeep", uber: false, paid: false, amount: null, status: "Confirmed", createdAt: t(4) },
    ];
    const out = formatPaymentSummary(date, 150, 40, bookings);
    expect(out).toMatchInlineSnapshot(`
      "*HYROX training fee - Apr 25*

      Coach Training Fee - $150
      Gym Fee - $40

      Aiko- $190✅
      Pats- $190+Uber $42 =$232✅
      Natalia- $190+Uber $42 =$232
      Mandeep- $190"
    `);
  });

  it("orders confirmed bookings by createdAt ASC and excludes cancelled/waitlist", () => {
    const bookings: PaymentBooking[] = [
      { name: "Third", uber: false, paid: false, amount: null, status: "Confirmed", createdAt: t(30) },
      { name: "Cancelled", uber: false, paid: true, amount: null, status: "Cancelled", createdAt: t(15) },
      { name: "Waitlisted", uber: false, paid: false, amount: null, status: "Waitlist", createdAt: t(15) },
      { name: "First", uber: false, paid: false, amount: null, status: "Confirmed", createdAt: t(10) },
      { name: "Second", uber: false, paid: false, amount: null, status: "Confirmed", createdAt: t(20) },
    ];
    const out = formatPaymentSummary(date, 150, 40, bookings);
    expect(out).not.toContain("Cancelled");
    expect(out).not.toContain("Waitlisted");
    const firstIdx = out.indexOf("First");
    const secondIdx = out.indexOf("Second");
    const thirdIdx = out.indexOf("Third");
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  it("falls back to base total when uber is true but amount is not set above base", () => {
    const bookings: PaymentBooking[] = [
      // Uber checked but no recorded amount — surface base only (no breakdown).
      { name: "Solo", uber: true, paid: false, amount: null, status: "Confirmed", createdAt: t(1) },
    ];
    const out = formatPaymentSummary(date, 150, 40, bookings);
    expect(out).toContain("Solo- $190");
    expect(out).not.toContain("+Uber");
  });
});
