import "server-only";
import type { Platform, PublishState, SocialAccount } from "./types";

// Zernio (zernio.com) holds the connected Instagram and LinkedIn accounts and publishes
// posts at their scheduled time. API reference: the official @zernio/node SDK types.
const BASE = process.env.ZERNIO_BASE_URL || "https://zernio.com/api";

export class PostingError extends Error {}

export const postingConfigured = () => Boolean(process.env.ZERNIO_API_KEY);

async function call<T>(method: string, path: string, opts: { query?: Record<string, string>; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) throw new PostingError("Auto-posting is not set up: ZERNIO_API_KEY is missing.");
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), cache: "no-store" });
  } catch {
    throw new PostingError("Could not reach the posting service. Try again.");
  }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { error: text.slice(0, 300) }; } })() : {};
  if (!res.ok && res.status !== 207) {
    if (res.status === 401) throw new PostingError("The Zernio API key is invalid. Check ZERNIO_API_KEY.");
    if (res.status === 402 || data?.code === "PAYMENT_REQUIRED") throw new PostingError("Your Zernio plan does not cover this. Check your Zernio billing.");
    if (res.status === 429) throw new PostingError("The posting service is busy. Try again in a minute.");
    throw new PostingError(data?.error ? String(data.error) : `The posting service returned an error (${res.status}).`);
  }
  return data as T;
}

type ZProfile = { _id: string; name?: string; externalId?: string };

/** Finds or creates the Zernio profile that groups one brand's accounts. */
export async function ensureProfile(brand: { id: string; name: string; tz: string }): Promise<string> {
  const found = await call<{ profiles?: ZProfile[] }>("GET", "/v1/profiles", { query: { externalId: brand.id } });
  const hit = found.profiles?.find((p) => p.externalId === brand.id);
  if (hit) return hit._id;
  const made = await call<{ profile?: ZProfile }>("POST", "/v1/profiles", {
    body: { name: `${brand.name} (${brand.id.slice(0, 8)})`, externalId: brand.id, timezone: brand.tz },
    idempotencyKey: `profile-${brand.id}`,
  });
  if (!made.profile?._id) throw new PostingError("The posting service did not create a profile.");
  return made.profile._id;
}

/** URL of the platform's own login page; the person comes back to `redirectUrl`. */
export async function connectUrl(profileId: string, platform: Platform, redirectUrl: string): Promise<string> {
  const res = await call<{ authUrl?: string }>("GET", `/v1/connect/${platform}`, { query: { profileId, redirect_url: redirectUrl } });
  if (!res.authUrl) throw new PostingError("The posting service did not return a login link.");
  return res.authUrl;
}

type ZAccount = { _id: string; platform: string; profileId: string | { _id: string }; username?: string; displayName?: string; profilePicture?: string | null; isActive?: boolean };

export async function listAccounts(profileId: string): Promise<SocialAccount[]> {
  const res = await call<{ accounts?: ZAccount[] }>("GET", "/v1/accounts");
  return (res.accounts ?? [])
    .filter((a) => (typeof a.profileId === "string" ? a.profileId : a.profileId?._id) === profileId)
    .filter((a) => (a.platform === "instagram" || a.platform === "linkedin") && a.isActive !== false)
    .map((a) => ({ id: a._id, platform: a.platform as Platform, name: a.displayName || a.username || a.platform, username: a.username ?? "", picture: a.profilePicture ?? null }));
}

export async function disconnectAccount(accountId: string): Promise<void> {
  await call("DELETE", `/v1/accounts/${accountId}`);
}

export type ZTarget = { platform: Platform; accountId: string; customContent: string; customMedia: { url: string; type: string; title?: string }[]; platformSpecificData?: Record<string, unknown> };

/** Schedules a post. A `scheduledFor` without an offset is read as local time in `timezone`. */
export async function createPost(input: { title: string; targets: ZTarget[]; scheduledFor: string | null; timezone: string; idempotencyKey: string; externalId: string }): Promise<{ id: string; state: PublishState }> {
  const res = await call<{ post?: ZPost }>("POST", "/v1/posts", {
    body: {
      title: input.title,
      platforms: input.targets,
      ...(input.scheduledFor ? { scheduledFor: input.scheduledFor, timezone: input.timezone } : { publishNow: true }),
      metadata: { buzzbitePostId: input.externalId },
    },
    idempotencyKey: input.idempotencyKey,
  });
  if (!res.post?._id) throw new PostingError("The posting service did not accept the post.");
  return { id: res.post._id, state: toState(res.post.status) };
}

/** Removes a post that has not gone out yet. Already-published posts stay on the platforms. */
export async function deletePost(id: string): Promise<void> {
  try {
    await call("DELETE", `/v1/posts/${id}`);
  } catch (e) {
    // Already gone, or already published (which cannot be deleted): nothing left to cancel.
    if (e instanceof PostingError && /not found|published/i.test(e.message)) return;
    throw e;
  }
}

type ZPost = {
  _id: string;
  status?: string;
  platforms?: { platform?: string; status?: string; platformPostUrl?: string | null; errorMessage?: string }[];
};

export async function getPost(id: string): Promise<{ state: PublishState; urls: Partial<Record<Platform, string>>; error: string | null }> {
  const res = await call<{ post?: ZPost } & ZPost>("GET", `/v1/posts/${id}`);
  const post = res.post ?? res;
  const urls: Partial<Record<Platform, string>> = {};
  const errors: string[] = [];
  for (const p of post.platforms ?? []) {
    if ((p.platform === "instagram" || p.platform === "linkedin") && p.platformPostUrl) urls[p.platform] = p.platformPostUrl;
    if (p.status === "failed" && p.errorMessage) errors.push(`${p.platform === "linkedin" ? "LinkedIn" : "Instagram"}: ${p.errorMessage}`);
  }
  return { state: toState(post.status), urls, error: errors.join(" ") || null };
}

function toState(s: string | undefined): PublishState {
  if (s === "published" || s === "partial" || s === "failed" || s === "cancelled" || s === "publishing") return s;
  return "scheduled";
}
