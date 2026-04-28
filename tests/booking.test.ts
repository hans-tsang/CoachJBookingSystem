import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { PrismaClient } from "@prisma/client";

import { setEmailProvider, type EmailProvider, type EmailMessage } from "@/lib/email";

let prisma: PrismaClient;
let dbFile: string;

const sentEmails: EmailMessage[] = [];
const captureProvider: EmailProvider = {
  async send(msg) {
    sentEmails.push(msg);
    return { id: "test" };
  },
};

beforeAll(() => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyrox-test-"));
  dbFile = path.join(tmpDir, "test.db");
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SESSION_SECRET = "test-secret-key-not-for-production";

  // Push schema (creates DB)
  execSync("pnpm exec prisma db push --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
  });

  prisma = new PrismaClient({ datasources: { db: { url: `file:${dbFile}` } } });
  setEmailProvider(captureProvider);
});

afterAll(async () => {
  await prisma.$disconnect();
  setEmailProvider(null);
});

beforeEach(async () => {
  sentEmails.length = 0;
  await prisma.booking.deleteMany();
  await prisma.slot.deleteMany();
  await prisma.auditLog.deleteMany();
});

// We need to import lazily so they pick up the test DATABASE_URL set above.
async function getBookingLib() {
  return await import("@/lib/booking");
}

async function makeSlot(capacity = 2) {
  return prisma.slot.create({
    data: {
      date: new Date(Date.UTC(2025, 0, 4)),
      time: "09:30-11:00",
      capacity,
      order: 1,
    },
  });
}

describe("createBooking — capacity math", () => {
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

  it("rejects duplicate (same name + whatsapp) in same slot", async () => {
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

describe("cancelBooking — waitlist promotion", () => {
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

    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0].to).toBe("bob@example.com");
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
