import { prisma } from "./db";
import { nextSaturday, toISODate } from "./utils";

export type AppSettings = {
  gymLocation: string;
  trainingDate: Date;
  coachFee: number;
  gymFee: number;
};

const DEFAULTS = {
  gymLocation: "TBD",
  coachFee: "150",
  gymFee: "100",
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const trainingDateStr = map.get("trainingDate");
  const trainingDate = trainingDateStr
    ? new Date(`${trainingDateStr}T00:00:00.000Z`)
    : nextSaturday();

  return {
    gymLocation: map.get("gymLocation") ?? DEFAULTS.gymLocation,
    trainingDate,
    coachFee: parseInt(map.get("coachFee") ?? DEFAULTS.coachFee, 10),
    gymFee: parseInt(map.get("gymFee") ?? DEFAULTS.gymFee, 10),
  };
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function updateSettings(input: {
  gymLocation: string;
  trainingDate: string; // YYYY-MM-DD
  coachFee: number;
  gymFee: number;
}): Promise<void> {
  await prisma.$transaction([
    prisma.setting.upsert({
      where: { key: "gymLocation" },
      create: { key: "gymLocation", value: input.gymLocation },
      update: { value: input.gymLocation },
    }),
    prisma.setting.upsert({
      where: { key: "trainingDate" },
      create: { key: "trainingDate", value: input.trainingDate },
      update: { value: input.trainingDate },
    }),
    prisma.setting.upsert({
      where: { key: "coachFee" },
      create: { key: "coachFee", value: String(input.coachFee) },
      update: { value: String(input.coachFee) },
    }),
    prisma.setting.upsert({
      where: { key: "gymFee" },
      create: { key: "gymFee", value: String(input.gymFee) },
      update: { value: String(input.gymFee) },
    }),
  ]);
}

export { toISODate };
