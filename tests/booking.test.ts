import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

import { setEmailProvider, type EmailProvider, type EmailMessage } from "@/lib/email";

// These integration tests run against a real Postgres database. Set
// TEST_DATABASE_URL to a disposable Postgres connection string to enable them.
// They are skipped (not failed) when the variable is absent so that `pnpm test`
// works in environments without Postgres (e.g. fresh clones, CI on Vercel).
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

let prisma: PrismaClient;

const sentEmails: EmailMessage[] = [];
const captureProvider: EmailProvider = {
  async send(msg) {
    sentEmails.push(msg);
    return { id: "test" };
  },
};

beforeAll(() => {
  if (!TEST_DATABASE_URL) return;
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.SESSION_SECRET = "test-secret-key-not-for-production";

  // Push schema (creates / updates tables in the test database).
  execSync("pnpm exec prisma db push --skip-generate --accept-data-loss", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });

  prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  setEmailProvider(captureProvider);
});

afterAll(async () => {
  if (!TEST_DATABASE_URL) return;
  await prisma.$disconnect();
  setEmailProvider(null);
});

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  sentEmails.length = 0;
  await prisma.booking.deleteMany();
  await prisma.slot.deleteMany();
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
});

// We need to import lazily so they pick up the test DATABASE_URL set above.
async function getBookingLib() {
  return await import("@/lib/booking");
}

async function makeSession(overrides: Partial<{
  name: string;
  location: string;
  date: Date;
  coachFee: number;
  gymFee: number;
  openAt: Date | null;
  closeAt: Date | null;
}> = {}) {
  return prisma.session.create({
    data: {
      name: overrides.name ?? "Test Session",
      location: overrides.location ?? "Test Gym",
      date: overrides.date ?? new Date(Date.UTC(2026, 4, 2)),
      coachFee: overrides.coachFee ?? 150,
      gymFee: overrides.gymFee ?? 100,
      openAt: overrides.openAt ?? null,
      closeAt: overrides.closeAt ?? null,
    },
  });
}

async function makeSlot(capacity = 2, sessionId?: string) {
  const session = sessionId
    ? await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })
    : await makeSession();
  return prisma.slot.create({
    data: {
      sessionId: session.id,
      date: session.date,
      time: "09:30-11:00",
      capacity,
      order: 1,
    },
  });
}

describeIfDb("createBooking — capacity math", () => {
  it("first booking is Confirmed at position 1", async () => {
    const slot = await makeSlot(2);
    const { createBooking } = await getBookingLib();
    const r = await createBooking({
      slotId: slot.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.status).toBe("Confirmed");
      expect(r.position).toBe(1);
    }
  });

  it("booking past capacity goes to Waitlist with position", async () => {
    const slot = await makeSlot(1);
    const { createBooking } = await getBookingLib();
    await createBooking({
      slotId: slot.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    const r2 = await createBooking({
      slotId: slot.id,
      name: "Bob",
      whatsapp: "85293334444",
      uber: false,
      payment: "PayMe",
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.status).toBe("Waitlist");
      expect(r2.position).toBe(1);
    }

    const r3 = await createBooking({
      slotId: slot.id,
      name: "Carol",
      whatsapp: "85295556666",
      uber: false,
      payment: "PayMe",
    });
    if (r3.ok) {
      expect(r3.status).toBe("Waitlist");
      expect(r3.position).toBe(2);
    }
  });

  it("rejects duplicate whatsapp in same slot", async () => {
    const slot = await makeSlot(5);
    const { createBooking } = await getBookingLib();
    await createBooking({
      slotId: slot.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    const r = await createBooking({
      slotId: slot.id,
      name: "alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("DUPLICATE");
  });

  it("rejects same whatsapp booking a different slot in the same session", async () => {
    const session = await makeSession();
    const slotA = await prisma.slot.create({
      data: { sessionId: session.id, date: session.date, time: "09:00-10:30", capacity: 5, order: 1 },
    });
    const slotB = await prisma.slot.create({
      data: { sessionId: session.id, date: session.date, time: "11:00-12:30", capacity: 5, order: 2 },
    });
    const { createBooking } = await getBookingLib();
    const r1 = await createBooking({
      slotId: slotA.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    expect(r1.ok).toBe(true);
    // Same whatsapp, different name, different slot in the same session → rejected.
    const r2 = await createBooking({
      slotId: slotB.id,
      name: "Alice's Friend",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe("DUPLICATE");
  });

  it("allows the same whatsapp to book slots in different sessions", async () => {
    const sessionA = await makeSession({ name: "Session A" });
    const sessionB = await makeSession({ name: "Session B" });
    const slotA = await makeSlot(2, sessionA.id);
    const slotB = await makeSlot(2, sessionB.id);
    const { createBooking } = await getBookingLib();
    const r1 = await createBooking({
      slotId: slotA.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    const r2 = await createBooking({
      slotId: slotB.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it("allows rebooking a different slot in the same session after cancelling", async () => {
    const session = await makeSession();
    const slotA = await prisma.slot.create({
      data: { sessionId: session.id, date: session.date, time: "09:00-10:30", capacity: 5, order: 1 },
    });
    const slotB = await prisma.slot.create({
      data: { sessionId: session.id, date: session.date, time: "11:00-12:30", capacity: 5, order: 2 },
    });
    const { createBooking, cancelBooking } = await getBookingLib();
    await createBooking({
      slotId: slotA.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    const cancelled = await cancelBooking({
      name: "Alice",
      whatsapp: "85291112222",
      sessionId: session.id,
    });
    expect(cancelled.ok).toBe(true);
    const r = await createBooking({
      slotId: slotB.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    expect(r.ok).toBe(true);
  });

  it("returns SLOT_NOT_FOUND for unknown slot", async () => {
    const { createBooking } = await getBookingLib();
    const r = await createBooking({
      slotId: "missing",
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("SLOT_NOT_FOUND");
  });
});

describeIfDb("cancelBooking — waitlist promotion", () => {
  it("promotes oldest waitlist and sends email when a Confirmed booking cancels", async () => {
    const slot = await makeSlot(1);
    const { createBooking, cancelBooking } = await getBookingLib();
    await createBooking({
      slotId: slot.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
      email: "alice@example.com",
    });
    // Two waitlisters; oldest (Bob) should be promoted.
    await createBooking({
      slotId: slot.id,
      name: "Bob",
      whatsapp: "85293334444",
      uber: false,
      payment: "PayMe",
      email: "bob@example.com",
    });
    await new Promise((r) => setTimeout(r, 5));
    await createBooking({
      slotId: slot.id,
      name: "Carol",
      whatsapp: "85295556666",
      uber: false,
      payment: "PayMe",
      email: "carol@example.com",
    });

    const result = await cancelBooking({ name: "Alice", whatsapp: "85291112222" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.promoted?.name).toBe("Bob");
    }

    const bob = await prisma.booking.findFirst({ where: { name: "Bob" } });
    const carol = await prisma.booking.findFirst({ where: { name: "Carol" } });
    expect(bob?.status).toBe("Confirmed");
    expect(carol?.status).toBe("Waitlist");

    const promotionEmails = sentEmails.filter((m) =>
      m.subject.startsWith("You're confirmed for training"),
    );
    expect(promotionEmails.length).toBe(1);
    expect(promotionEmails[0].to).toBe("bob@example.com");
  });

  it("does not promote when a Waitlist booking cancels", async () => {
    const slot = await makeSlot(1);
    const { createBooking, cancelBooking } = await getBookingLib();
    await createBooking({
      slotId: slot.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    await createBooking({
      slotId: slot.id,
      name: "Bob",
      whatsapp: "85293334444",
      uber: false,
      payment: "PayMe",
    });
    const result = await cancelBooking({ name: "Bob", whatsapp: "85293334444" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.promoted).toBeNull();

    const alice = await prisma.booking.findFirst({ where: { name: "Alice" } });
    expect(alice?.status).toBe("Confirmed");
  });

  it("matches name case-insensitively", async () => {
    const slot = await makeSlot(2);
    const { createBooking, cancelBooking } = await getBookingLib();
    await createBooking({
      slotId: slot.id,
      name: "Alice Wong",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    const r = await cancelBooking({ name: "alice wong", whatsapp: "85291112222" });
    expect(r.ok).toBe(true);
  });

  it("returns NOT_FOUND when no match", async () => {
    const slot = await makeSlot(2);
    const { createBooking, cancelBooking } = await getBookingLib();
    await createBooking({
      slotId: slot.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    const r = await cancelBooking({ name: "Alice", whatsapp: "85299999999" });
    expect(r.ok).toBe(false);
  });

  it("returns sessionName and slotTime in successful result", async () => {
    const session = await makeSession({ name: "Saturday Drills" });
    const slot = await makeSlot(2, session.id);
    const { createBooking, cancelBooking } = await getBookingLib();
    await createBooking({
      slotId: slot.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    const r = await cancelBooking({ name: "Alice", whatsapp: "85291112222" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sessionName).toBe("Saturday Drills");
      expect(r.slotTime).toBe(slot.time);
    }
  });

  it("returns MULTIPLE_MATCHES when 2+ active bookings match name+whatsapp and no sessionId is given", async () => {
    const sessionA = await makeSession({ name: "Session A" });
    const sessionB = await makeSession({ name: "Session B" });
    const slotA = await makeSlot(2, sessionA.id);
    const slotB = await makeSlot(2, sessionB.id);
    const { createBooking, cancelBooking } = await getBookingLib();
    await createBooking({
      slotId: slotA.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    await createBooking({
      slotId: slotB.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    const r = await cancelBooking({ name: "Alice", whatsapp: "85291112222" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("MULTIPLE_MATCHES");

    // Both bookings should still be active.
    const active = await prisma.booking.findMany({
      where: { whatsapp: "85291112222", status: { not: "Cancelled" } },
    });
    expect(active.length).toBe(2);
  });

  it("scopes cancellation to the given sessionId when multiple bookings match", async () => {
    const sessionA = await makeSession({ name: "Session A" });
    const sessionB = await makeSession({ name: "Session B" });
    const slotA = await makeSlot(2, sessionA.id);
    const slotB = await makeSlot(2, sessionB.id);
    const { createBooking, cancelBooking } = await getBookingLib();
    await createBooking({
      slotId: slotA.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    await createBooking({
      slotId: slotB.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    const r = await cancelBooking({
      name: "Alice",
      whatsapp: "85291112222",
      sessionId: sessionA.id,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sessionName).toBe("Session A");

    const aBooking = await prisma.booking.findFirst({ where: { slotId: slotA.id } });
    const bBooking = await prisma.booking.findFirst({ where: { slotId: slotB.id } });
    expect(aBooking?.status).toBe("Cancelled");
    expect(bBooking?.status).toBe("Confirmed");
  });

  it("returns NOT_FOUND when sessionId scopes away the only matching booking", async () => {
    const sessionA = await makeSession({ name: "Session A" });
    const sessionB = await makeSession({ name: "Session B" });
    const slotA = await makeSlot(2, sessionA.id);
    const { createBooking, cancelBooking } = await getBookingLib();
    await createBooking({
      slotId: slotA.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    const r = await cancelBooking({
      name: "Alice",
      whatsapp: "85291112222",
      sessionId: sessionB.id,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("NOT_FOUND");
  });

  it("writes audit log entries for each mutation", async () => {
    const slot = await makeSlot(1);
    const { createBooking, cancelBooking } = await getBookingLib();
    await createBooking({
      slotId: slot.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    await createBooking({
      slotId: slot.id,
      name: "Bob",
      whatsapp: "85293334444",
      uber: false,
      payment: "PayMe",
    });
    await cancelBooking({ name: "Alice", whatsapp: "85291112222" });

    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("book");
    expect(actions).toContain("cancel");
    expect(actions).toContain("promote");
  });
});

describeIfDb("markPaid — toggles paid flag and writes audit log", () => {
  it("toggles paid in both directions and writes audit log entries", async () => {
    const slot = await makeSlot(2);
    const { createBooking, markPaid } = await getBookingLib();
    const created = await createBooking({
      slotId: slot.id,
      name: "Alice",
      whatsapp: "85291112222",
      uber: false,
      payment: "PayMe",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await markPaid(created.bookingId, true);
    let row = await prisma.booking.findUnique({ where: { id: created.bookingId } });
    expect(row?.paid).toBe(true);

    await markPaid(created.bookingId, false);
    row = await prisma.booking.findUnique({ where: { id: created.bookingId } });
    expect(row?.paid).toBe(false);

    const logs = await prisma.auditLog.findMany({
      where: { action: "markPaid" },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.length).toBe(2);
    expect(JSON.parse(logs[0].payload)).toMatchObject({
      bookingId: created.bookingId,
      paid: true,
    });
    expect(JSON.parse(logs[1].payload)).toMatchObject({
      bookingId: created.bookingId,
      paid: false,
    });
  });
});

describeIfDb("session — open/close round-trip", () => {
  it("stores and reads back openAt; null clears the gate", async () => {
    const session = await makeSession();
    const iso = "2026-05-02T10:00:00.000Z";
    await prisma.session.update({ where: { id: session.id }, data: { openAt: new Date(iso) } });
    let row = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(row.openAt?.toISOString()).toBe(iso);

    await prisma.session.update({ where: { id: session.id }, data: { openAt: null } });
    row = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(row.openAt).toBeNull();
  });

  it("stores and reads back closeAt; default falls back to start-of-training-day local midnight", async () => {
    const session = await makeSession({ date: new Date("2026-05-02T00:00:00.000Z") });
    const closeIso = "2026-05-02T12:00:00.000Z";
    await prisma.session.update({ where: { id: session.id }, data: { closeAt: new Date(closeIso) } });
    let row = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(row.closeAt?.toISOString()).toBe(closeIso);

    const { effectiveCloseAt, defaultBookingsCloseAt } = await import("@/lib/settings");
    expect(effectiveCloseAt(row.date, row.closeAt).toISOString()).toBe(closeIso);

    await prisma.session.update({ where: { id: session.id }, data: { closeAt: null } });
    row = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(row.closeAt).toBeNull();
    expect(effectiveCloseAt(row.date, row.closeAt).toISOString()).toBe(
      defaultBookingsCloseAt(new Date("2026-05-02T00:00:00.000Z")).toISOString(),
    );
  });
});

describeIfDb("createBookingAction — bookings-open gate", () => {
  it("rejects bookings before openAt and accepts after", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const session = await makeSession({ openAt: future });
    const slot = await makeSlot(2, session.id);
    const { createBookingAction } = await import("@/app/(public)/actions");

    const fd = new FormData();
    fd.set("slotId", slot.id);
    fd.set("name", "Gated User");
    fd.set("whatsapp", "85291110000");
    fd.set("payment", "PayMe");
    const blocked = await createBookingAction(null, fd);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.toLowerCase()).toContain("not open");
    }

    // Open the gate.
    await prisma.session.update({ where: { id: session.id }, data: { openAt: null } });

    const fd2 = new FormData();
    fd2.set("slotId", slot.id);
    fd2.set("name", "Open User");
    fd2.set("whatsapp", "85291110001");
    fd2.set("payment", "PayMe");
    let redirected = false;
    try {
      await createBookingAction(null, fd2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NEXT_REDIRECT")) redirected = true;
      else throw err;
    }
    expect(redirected).toBe(true);

    const row = await prisma.booking.findFirst({ where: { name: "Open User" } });
    expect(row).not.toBeNull();
  });

  it("rejects bookings after closeAt", async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const session = await makeSession({ closeAt: past });
    const slot = await makeSlot(2, session.id);
    const { createBookingAction } = await import("@/app/(public)/actions");

    const fd = new FormData();
    fd.set("slotId", slot.id);
    fd.set("name", "Late User");
    fd.set("whatsapp", "85291110002");
    fd.set("payment", "PayMe");
    const blocked = await createBookingAction(null, fd);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.toLowerCase()).toContain("closed");
    }
  });
});

describe("areBookingsOpen", () => {
  it("returns true when openAt is null", async () => {
    const { areBookingsOpen } = await import("@/lib/settings");
    expect(areBookingsOpen(null)).toBe(true);
  });
  it("returns false strictly before openAt and true at/after", async () => {
    const { areBookingsOpen } = await import("@/lib/settings");
    const openAt = new Date("2026-05-02T10:00:00.000Z");
    expect(areBookingsOpen(openAt, new Date("2026-05-02T09:59:59.999Z"))).toBe(false);
    expect(areBookingsOpen(openAt, new Date("2026-05-02T10:00:00.000Z"))).toBe(true);
    expect(areBookingsOpen(openAt, new Date("2026-05-02T10:00:00.001Z"))).toBe(true);
  });
});

describe("areBookingsClosed", () => {
  it("returns false when closeAt is null", async () => {
    const { areBookingsClosed } = await import("@/lib/settings");
    expect(areBookingsClosed(null)).toBe(false);
  });
  it("returns false strictly before closeAt and true at/after", async () => {
    const { areBookingsClosed } = await import("@/lib/settings");
    const closeAt = new Date("2026-05-02T12:00:00.000Z");
    expect(areBookingsClosed(closeAt, new Date("2026-05-02T11:59:59.999Z"))).toBe(false);
    expect(areBookingsClosed(closeAt, new Date("2026-05-02T12:00:00.000Z"))).toBe(true);
    expect(areBookingsClosed(closeAt, new Date("2026-05-02T12:00:00.001Z"))).toBe(true);
  });
});

describe("getBookingsGateState", () => {
  it("returns 'open' when no gates are set", async () => {
    const { getBookingsGateState } = await import("@/lib/settings");
    expect(getBookingsGateState(null, null)).toBe("open");
  });
  it("returns 'pending' before openAt", async () => {
    const { getBookingsGateState } = await import("@/lib/settings");
    const openAt = new Date("2026-05-02T10:00:00.000Z");
    const closeAt = new Date("2026-05-02T12:00:00.000Z");
    expect(
      getBookingsGateState(openAt, closeAt, new Date("2026-05-02T09:00:00.000Z")),
    ).toBe("pending");
  });
  it("returns 'open' between openAt and closeAt", async () => {
    const { getBookingsGateState } = await import("@/lib/settings");
    const openAt = new Date("2026-05-02T10:00:00.000Z");
    const closeAt = new Date("2026-05-02T12:00:00.000Z");
    expect(
      getBookingsGateState(openAt, closeAt, new Date("2026-05-02T11:00:00.000Z")),
    ).toBe("open");
  });
  it("returns 'closed' at/after closeAt", async () => {
    const { getBookingsGateState } = await import("@/lib/settings");
    const openAt = new Date("2026-05-02T10:00:00.000Z");
    const closeAt = new Date("2026-05-02T12:00:00.000Z");
    expect(
      getBookingsGateState(openAt, closeAt, new Date("2026-05-02T12:00:00.000Z")),
    ).toBe("closed");
    expect(
      getBookingsGateState(null, closeAt, new Date("2026-05-02T13:00:00.000Z")),
    ).toBe("closed");
  });
});

describe("defaultBookingsCloseAt", () => {
  it("returns local midnight at the start of the training day in the given timezone", async () => {
    const { defaultBookingsCloseAt } = await import("@/lib/settings");
    const trainingDate = new Date("2026-05-02T00:00:00.000Z");
    // Asia/Shanghai is UTC+8 (no DST), so local midnight 2026-05-02 = 2026-05-01T16:00:00Z.
    expect(defaultBookingsCloseAt(trainingDate, "Asia/Shanghai").toISOString()).toBe(
      "2026-05-01T16:00:00.000Z",
    );
  });
  it("returns UTC midnight when timezone is UTC", async () => {
    const { defaultBookingsCloseAt } = await import("@/lib/settings");
    const trainingDate = new Date("2026-05-02T00:00:00.000Z");
    expect(defaultBookingsCloseAt(trainingDate, "UTC").toISOString()).toBe(
      "2026-05-02T00:00:00.000Z",
    );
  });
  it("strips any time component from the training date", async () => {
    const { defaultBookingsCloseAt } = await import("@/lib/settings");
    const trainingDate = new Date("2026-05-02T15:30:45.000Z");
    expect(defaultBookingsCloseAt(trainingDate, "UTC").toISOString()).toBe(
      "2026-05-02T00:00:00.000Z",
    );
  });
  it("handles westward zones (negative offsets) correctly", async () => {
    const { defaultBookingsCloseAt } = await import("@/lib/settings");
    const trainingDate = new Date("2026-05-02T00:00:00.000Z");
    // America/New_York on 2026-05-02 is UTC-4 (EDT), so local midnight = 2026-05-02T04:00:00Z.
    expect(
      defaultBookingsCloseAt(trainingDate, "America/New_York").toISOString(),
    ).toBe("2026-05-02T04:00:00.000Z");
  });
});
