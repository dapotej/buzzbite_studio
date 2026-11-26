// Session cookie for the single-password v1. Runs in middleware (Edge) and on the server,
// so it uses Web Crypto only.
export const SESSION_COOKIE = "bl_session";
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

export async function createSessionValue(): Promise<{ value: string; maxAge: number }> {
  const expires = Date.now() + MAX_AGE_DAYS * 86400_000;
  return { value: `${expires}.${await hmac(secret(), String(expires))}`, maxAge: MAX_AGE_DAYS * 86400 };
}

export async function isValidSession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [expires, sig] = value.split(".");
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  const expected = await hmac(secret(), expires);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export async function passwordMatches(input: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  // Compare digests so the comparison takes the same time whatever the input.
  const [a, b] = await Promise.all([hmac(secret(), input), hmac(secret(), expected)]);
  return a === b;
}
