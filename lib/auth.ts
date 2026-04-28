import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { getSetting, setSetting } from "./settings";

const COOKIE_NAME = "hyrox_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET env var is required (>= 16 chars). Set it in .env or your deployment environment.",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function makeToken(): string {
  const nonce = randomBytes(24).toString("hex");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${nonce}.${expiresAt}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [nonce, expStr, sig] = parts;
  const expectedSig = sign(`${nonce}.${expStr}`);
  let sigOk = false;
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expectedSig, "hex");
    if (a.length !== b.length) return false;
    sigOk = timingSafeEqual(a, b);
  } catch {
    return false;
  }
  if (!sigOk) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  return true;
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return verifyToken(token);
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAuthenticated())) {
    throw new Error("Unauthorized");
  }
}

async function getAdminPasswordHash(): Promise<string> {
  let hash = await getSetting("adminPasswordHash");
  if (!hash) {
    const initial = process.env.ADMIN_PASSWORD_INITIAL;
    if (!initial) {
      throw new Error(
        "No admin password configured. Set ADMIN_PASSWORD_INITIAL on first boot, then change it in the admin panel.",
      );
    }
    hash = await bcrypt.hash(initial, 10);
    await setSetting("adminPasswordHash", hash);
  }
  return hash;
}

export async function login(password: string): Promise<boolean> {
  const hash = await getAdminPasswordHash();
  const ok = await bcrypt.compare(password, hash);
  if (!ok) return false;
  const token = makeToken();
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  await prisma.auditLog.create({
    data: { action: "adminLogin", payload: JSON.stringify({ ts: Date.now() }) },
  });
  return true;
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const hash = await getAdminPasswordHash();
  const ok = await bcrypt.compare(currentPassword, hash);
  if (!ok) return false;
  const newHash = await bcrypt.hash(newPassword, 10);
  await setSetting("adminPasswordHash", newHash);
  return true;
}
