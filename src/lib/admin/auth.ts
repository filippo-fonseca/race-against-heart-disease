import { createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection, type NextRequest } from "next/server";
import { safeEqual } from "../safe-equal";

/**
 * Single-admin auth for /admin. The password lives in ADMIN_PASSWORD and is
 * compared in constant time; a successful login sets `rahd_admin`, an
 * httpOnly cookie carrying an expiry timestamp and an HMAC-SHA256 over it
 * keyed with ADMIN_SESSION_SECRET. Nothing here ever logs a secret.
 *
 * `requireAdmin()` is for Server Components and Server Actions (it reads
 * cookies() and redirects); `isAdminRequest(req)` is the proxy's cheap check
 * on the raw request. Both verify the same signature.
 */

export const ADMIN_COOKIE = "rahd_admin";
export const SESSION_DAYS = 7;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

const LOGIN_PATH = "/admin/login";

/* ------------------------------------------------------------------ */
/* Secrets                                                             */
/* ------------------------------------------------------------------ */

function sessionSecret(): string | null {
  const s = process.env.ADMIN_SESSION_SECRET;
  return s && s.length >= 16 ? s : null;
}

/** True when `candidate` matches ADMIN_PASSWORD. False when the env is unset. */
export function checkPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof candidate !== "string") return false;
  return safeEqual(candidate, expected);
}

/* ------------------------------------------------------------------ */
/* Session token                                                       */
/* ------------------------------------------------------------------ */

function sign(exp: string, secret: string): string {
  return createHmac("sha256", secret).update(exp, "utf8").digest("base64url");
}

/** `<exp>.<base64url hmac>`; `exp` is unix milliseconds. */
export function createSessionToken(now = Date.now()): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const exp = String(now + SESSION_MS);
  return `${exp}.${sign(exp, secret)}`;
}

export function verifySessionToken(token: string | undefined | null, now = Date.now()): boolean {
  const secret = sessionSecret();
  if (!secret || !token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d{1,16}$/.test(exp) || mac.length === 0) return false;
  if (!safeEqual(mac, sign(exp, secret))) return false;
  return Number(exp) > now;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

/** Set the session cookie. Call from a Server Action or Route Handler only. */
export async function startSession(): Promise<boolean> {
  const token = createSessionToken();
  if (!token) return false;
  (await cookies()).set(ADMIN_COOKIE, token, sessionCookieOptions);
  return true;
}

/** Clear the session cookie. Call from a Server Action or Route Handler only. */
export async function endSession(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

/** Whether the current request carries a valid session (no redirect). */
export async function isAdmin(): Promise<boolean> {
  // Session expiry is checked against the clock, so this is request-time work.
  await connection();
  return verifySessionToken((await cookies()).get(ADMIN_COOKIE)?.value);
}

/**
 * For Server Components and Server Actions: resolves when the caller is the
 * admin, otherwise redirects to the login page. Reads cookies(), so with
 * Cache Components the caller must sit inside a Suspense boundary.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect(LOGIN_PATH);
}

/** For the proxy: same check against the raw request's cookies. */
export function isAdminRequest(req: NextRequest): boolean {
  return verifySessionToken(req.cookies.get(ADMIN_COOKIE)?.value);
}

/* ------------------------------------------------------------------ */
/* Login rate limit (best effort, per server instance)                 */
/* ------------------------------------------------------------------ */

const LIMIT_ATTEMPTS = 5;
const LIMIT_WINDOW_MS = 15 * 60 * 1000;

type Bucket = { count: number; resetAt: number };
const attempts = new Map<string, Bucket>();

function sweep(now: number): void {
  if (attempts.size < 1000) return;
  for (const [ip, b] of attempts) if (b.resetAt <= now) attempts.delete(ip);
}

/** Best-effort client address from the proxy headers; "unknown" when absent. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return h.get("x-real-ip")?.trim() || "unknown";
}

/** True when the IP still has login attempts left in the current window. */
export function loginAllowed(ip: string, now = Date.now()): boolean {
  const b = attempts.get(ip);
  if (!b || b.resetAt <= now) return true;
  return b.count < LIMIT_ATTEMPTS;
}

/** Record a failed attempt. */
export function recordFailedLogin(ip: string, now = Date.now()): void {
  sweep(now);
  const b = attempts.get(ip);
  if (!b || b.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + LIMIT_WINDOW_MS });
  } else {
    b.count += 1;
  }
}

/** Forget the IP's failures after a successful login. */
export function clearLoginAttempts(ip: string): void {
  attempts.delete(ip);
}
