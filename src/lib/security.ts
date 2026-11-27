import "server-only";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { cookies, headers } from "next/headers";
import { getUser } from "./accounts";
import { SESSION_COOKIE, createSessionValue } from "./auth";
import { newToken } from "./passwords";

// Sign-in sessions, rate limits and password reset links.

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

/** Signs the user in on this device, at their current session version. */
export async function startSession(userId: string): Promise<void> {
  const user = await getUser(userId);
  const { value, maxAge } = await createSessionValue(userId, user?.session_version ?? 0);
  (await cookies()).set(SESSION_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge, path: "/" });
}

/** The visitor's IP address as Vercel reports it. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 64);
}

// ---------- rate limits ----------
// Each limit counts recent attempts under a key, e.g. failed sign-ins for one email.
export const LIMITS = {
  loginEmail: { max: 8, minutes: 15 },    // failed sign-ins for one account
  loginIp: { max: 30, minutes: 15 },      // failed sign-ins from one address
  resetEmail: { max: 3, minutes: 60 },    // reset emails to one account
  resetIp: { max: 10, minutes: 60 },      // reset requests from one address
  leadIp: { max: 10, minutes: 60 },       // website form sign-ups from one address
} as const;
type Limit = (typeof LIMITS)[keyof typeof LIMITS];

/** True when any of the keys has reached its limit. Fails open if the database is unreachable. */
export async function limited(checks: [string, Limit][]): Promise<boolean> {
  try {
    for (const [key, l] of checks) {
      const rows = await client()`select count(*)::int as n from auth_attempts where key = ${key} and at > now() - make_interval(mins => ${l.minutes})`;
      if (Number((rows[0] as { n: number }).n) >= l.max) return true;
    }
  } catch (e) {
    console.error("rate limit check failed", e);
  }
  return false;
}

export async function noteAttempt(...keys: string[]): Promise<void> {
  try {
    for (const key of keys) await client()`insert into auth_attempts (key) values (${key})`;
    // Keep the table small: attempts older than a day no longer count towards any limit.
    if (Math.random() < 0.05) await client()`delete from auth_attempts where at < now() - interval '1 day'`;
  } catch (e) {
    console.error("could not record attempt", e);
  }
}

export async function clearAttempts(key: string): Promise<void> {
  await client()`delete from auth_attempts where key = ${key}`.catch(() => undefined);
}

// ---------- password reset ----------
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const RESET_HOURS = 2;

/** Makes a one-time reset link for the user. Only a hash of it is stored. */
export async function createResetToken(userId: string): Promise<string> {
  const token = newToken();
  const expires = new Date(Date.now() + RESET_HOURS * 3600_000).toISOString();
  // A new link replaces any earlier one.
  await client()`update password_resets set used_at = now() where user_id = ${userId} and used_at is null`;
  await client()`insert into password_resets (token_hash, user_id, expires_at) values (${hashToken(token)}, ${userId}, ${expires})`;
  return token;
}

/** The user a reset link belongs to, if it is unused and not expired. */
export async function resetTokenUser(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null;
  const rows = await client()`select user_id from password_resets where token_hash = ${hashToken(token)} and used_at is null and expires_at > now()`;
  return (rows[0] as { user_id: string } | undefined)?.user_id ?? null;
}

/** Marks a reset link used. Returns false if it was already used (two tabs, a replay). */
export async function useResetToken(token: string): Promise<boolean> {
  const rows = await client()`update password_resets set used_at = now() where token_hash = ${hashToken(token)} and used_at is null and expires_at > now() returning user_id`;
  return rows.length > 0;
}

export const RESET_LINK_HOURS = RESET_HOURS;
