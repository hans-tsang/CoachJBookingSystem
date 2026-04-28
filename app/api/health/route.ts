import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "ok" });
  } catch (err) {
    return NextResponse.json(
      { ok: false, db: "error", error: err instanceof Error ? err.message : "unknown" },
      { status: 503 },
    );
  }
}
