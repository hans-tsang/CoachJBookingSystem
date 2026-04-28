import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { nextSaturday, toISODate } from "../lib/utils";

const prisma = new PrismaClient();

async function main() {
  const saturday = nextSaturday();
  const trainingDateISO = toISODate(saturday);

  const initialPassword = process.env.ADMIN_PASSWORD_INITIAL ?? "change-me-on-first-login";
  const hash = await bcrypt.hash(initialPassword, 10);

  const settings: Array<{ key: string; value: string }> = [
    { key: "gymLocation", value: "Coach J Gym, Hong Kong" },
    { key: "trainingDate", value: trainingDateISO },
    { key: "coachFee", value: "150" },
    { key: "gymFee", value: "100" },
    { key: "adminPasswordHash", value: hash },
  ];

  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      create: s,
      update: { value: s.value },
    });
  }

  const slotDefs = [
    { time: "09:30-11:00", capacity: 15, order: 1 },
    { time: "11:30-13:00", capacity: 15, order: 2 },
    { time: "13:30-15:00", capacity: 14, order: 3 },
  ];

  for (const def of slotDefs) {
    await prisma.slot.upsert({
      where: { date_time: { date: saturday, time: def.time } },
      create: { ...def, date: saturday },
      update: { capacity: def.capacity, order: def.order },
    });
  }

   
  console.log(`Seeded settings + 3 slots for ${trainingDateISO}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
     
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
