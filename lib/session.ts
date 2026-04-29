import { prisma } from "./db";
import { parseISODate } from "./utils";

/**
 * Inputs for creating/updating a Session. Times are ISO datetime strings
 * (UTC); empty string clears.
 */
export type SessionInput = {
  name: string;
  location: string;
  /** YYYY-MM-DD (UTC). */
  date: string;
  coachFee: number;
  gymFee: number;
  /** ISO datetime string in UTC, or empty string to clear. */
  openAt?: string | null;
  /** ISO datetime string in UTC, or empty string to clear. */
  closeAt?: string | null;
};

export type SessionRecord = {
  id: string;
  name: string;
  location: string;
  date: Date;
  coachFee: number;
  gymFee: number;
  openAt: Date | null;
  closeAt: Date | null;
  isArchived: boolean;
  createdAt: Date;
};

function toRecord(row: {
  id: string;
  name: string;
  location: string;
  date: Date;
  coachFee: number;
  gymFee: number;
  openAt: Date | null;
  closeAt: Date | null;
  isArchived: boolean;
  createdAt: Date;
}): SessionRecord {
  return row;
}

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? null : t;
}

export async function createSession(input: SessionInput): Promise<SessionRecord> {
  const row = await prisma.session.create({
    data: {
      name: input.name.trim(),
      location: input.location.trim(),
      date: parseISODate(input.date),
      coachFee: input.coachFee,
      gymFee: input.gymFee,
      openAt: parseInstant(input.openAt),
      closeAt: parseInstant(input.closeAt),
    },
  });
  await prisma.auditLog.create({
    data: {
      action: "createSession",
      payload: JSON.stringify({ sessionId: row.id, name: row.name }),
    },
  });
  return toRecord(row);
}

export async function updateSession(id: string, input: SessionInput): Promise<SessionRecord> {
  const row = await prisma.session.update({
    where: { id },
    data: {
      name: input.name.trim(),
      location: input.location.trim(),
      date: parseISODate(input.date),
      coachFee: input.coachFee,
      gymFee: input.gymFee,
      openAt: parseInstant(input.openAt),
      closeAt: parseInstant(input.closeAt),
    },
  });
  return toRecord(row);
}

export async function archiveSession(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.session.findUnique({ where: { id } });
    if (!existing || existing.isArchived) return;
    await tx.session.update({ where: { id }, data: { isArchived: true } });
    await tx.auditLog.create({
      data: {
        action: "archiveSession",
        payload: JSON.stringify({ sessionId: id, name: existing.name }),
      },
    });
  });
}

export async function unarchiveSession(id: string): Promise<void> {
  await prisma.session.update({ where: { id }, data: { isArchived: false } });
}

/** Active (non-archived) sessions ordered by date ascending. */
export async function getActiveSessions(): Promise<SessionRecord[]> {
  const rows = await prisma.session.findMany({
    where: { isArchived: false },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toRecord);
}

/** All sessions (active and archived) ordered by date descending for admin. */
export async function getAllSessions(): Promise<SessionRecord[]> {
  const rows = await prisma.session.findMany({
    orderBy: [{ isArchived: "asc" }, { date: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toRecord);
}

export async function getSessionById(id: string): Promise<SessionRecord | null> {
  const row = await prisma.session.findUnique({ where: { id } });
  return row ? toRecord(row) : null;
}
