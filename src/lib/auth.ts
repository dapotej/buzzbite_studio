// Session cookie: "<userId>.<expires>.<signature>". Runs in middleware (Edge) and on the
// server, so it uses Web Crypto only. Password hashing lives in passwords.ts (Node only).
export const SESSION_COOKIE = "bb_session";
const MAX_AGE_DAYS = 30;

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return s;
}

/** A signature only this app can make, for links that outside services call back on (webhooks). */
export async function signValue(message: string): Promise<string> {
  return hmac(secret(), `value:${message}`);
}
export async function signatureMatches(message: string, sig: string | null | undefined): Promise<boolean> {
  return Boolean(sig) && same(await signValue(message), sig!);
}

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Cookie: "<userId>.<version>.<expires>.<signature>". The version is the user's session
// version: changing a password (or "sign out everywhere") bumps it, which ends every other session.
// Cookies from before versions existed have three parts and count as version 0.
export async function createSessionValue(userId: string, version = 0): Promise<{ value: string; maxAge: number }> {
  const expires = Date.now() + MAX_AGE_DAYS * 86400_000;
  const body = `${userId}.${version}.${expires}`;
  return { value: `${body}.${await hmac(secret(), body)}`, maxAge: MAX_AGE_DAYS * 86400 };
}

/** The signed-in user's id and session version, or null when the cookie is missing, expired or forged. */
export async function readSession(value: string | undefined): Promise<{ userId: string; version: number } | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3 && parts.length !== 4) return null;
  const [userId, ...rest] = parts;
  const sig = rest.pop()!;
  const expires = rest.pop()!;
  const version = rest.length ? Number(rest[0]) : 0;
  if (!/^[0-9a-f-]{36}$/.test(userId) || !(Number(expires) > Date.now()) || !Number.isInteger(version) || version < 0) return null;
  return same(await hmac(secret(), parts.slice(0, -1).join(".")), sig) ? { userId, version } : null;
}

/** The signed-in user's id, or null. Used by the middleware, which cannot reach the database. */
export async function sessionUserId(value: string | undefined): Promise<string | null> {
  return (await readSession(value))?.userId ?? null;
}

/** The one-time owner password from the single-password version, used only to claim the first workspace. */
export async function legacyPasswordMatches(input: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected || !input) return false;
  const [a, b] = await Promise.all([hmac(secret(), input), hmac(secret(), expected)]);
  return a === b;
}
