import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { nextSaturday } from "../lib/utils";

const prisma = new PrismaClient();

async function main() {
  const initialPassword = process.env.ADMIN_PASSWORD_INITIAL ?? "change-me-on-first-login";
  const hash = await bcrypt.hash(initialPassword, 10);

  await prisma.setting.upsert({
    where: { key: "adminPasswordHash" },
    create: { key: "adminPasswordHash", value: hash },
    update: { value: hash },
  });

  // Seed a default session if none exist (idempotent — only on first boot).
  const existing = await prisma.session.count();
  if (existing === 0) {
    const saturday = nextSaturday();
    const session = await prisma.session.create({
      data: {
        name: "HYROX",
        location: "Coach J Gym, Hong Kong",
        date: saturday,
        coachFee: 150,
        gymFee: 100,
      },
    });

    const slotDefs = [
      { time: "09:30-11:00", capacity: 15, order: 1 },
      { time: "11:30-13:00", capacity: 15, order: 2 },
      { time: "13:30-15:00", capacity: 14, order: 3 },
    ];

    for (const def of slotDefs) {
      await prisma.slot.create({
        data: { ...def, date: saturday, sessionId: session.id },
      });
    }

     
    console.log(`Seeded admin + 1 session "HYROX" with 3 slots for ${saturday.toISOString().slice(0, 10)}`);
  } else {
     
    console.log(`Skipped seeding — ${existing} session(s) already present.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
     
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
