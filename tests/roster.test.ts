import { describe, it, expect } from "vitest";
import { formatRoster, parseTimeLabel, type SlotWithBookings } from "@/lib/roster";

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
