import "server-only";
import { neon } from "@neondatabase/serverless";
import { PostingError, getAnalytics, getFollowerStats, postingConfigured, type ZMetrics } from "./zernio";
import type { Brand, Platform, PostSpec } from "./types";

// Results: how each post did, read from Zernio's analytics and kept here so the Results page is
// fast and the planner can learn which designs and themes work for each brand.
// Callers load the brand through the signed-in workspace first; queries here take its id.

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}
const DAYS_BACK = 120;
const dayIso = (d: Date) => d.toISOString().slice(0, 10);
const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

export type SyncState = { synced_at: string | null; access: boolean | null; error: string | null };

export async function syncState(brandId: string): Promise<SyncState> {
  const rows = await client()`select synced_at, access, error from brand_analytics where brand_id = ${brandId}`;
  const r = rows[0] as { synced_at: Date | null; access: boolean | null; error: string | null } | undefined;
  return { synced_at: r?.synced_at ? new Date(r.synced_at).toISOString() : null, access: r?.access ?? null, error: r?.error ?? null };
}

async function saveState(brandId: string, s: { access: boolean | null; error: string | null }) {
  await client()`insert into brand_analytics (brand_id, synced_at, access, error) values (${brandId}, now(), ${s.access}, ${s.error})
    on conflict (brand_id) do update set synced_at = now(), access = excluded.access, error = excluded.error`;
}

/** Reads the latest numbers from Zernio. Skips if read in the last hour, unless forced. */
export async function syncResults(brand: Brand, opts: { force?: boolean } = {}): Promise<SyncState> {
  const profileId = brand.social.profileId;
  if (!postingConfigured() || !profileId || !brand.social.accounts.length) return syncState(brand.id);
  const before = await syncState(brand.id);
  if (!opts.force && before.synced_at && Date.now() - new Date(before.synced_at).getTime() < 3600_000) return before;

  const from = dayIso(new Date(Date.now() - DAYS_BACK * 86400_000));
  try {
    // Posts we sent through Zernio, matched back to ours by Zernio's post id.
    const ours = new Map<string, string>(
      ((await client()`select id, publishing->>'zernioId' as zid from posts where brand_id = ${brand.id} and publishing->>'zernioId' is not null`) as { id: string; zid: string }[])
        .map((r) => [r.zid, r.id]),
    );
    let access = true;
    for (let page = 1; page <= 5; page++) {
      const res = await getAnalytics(profileId, from, page);
      if (!res.hasAccess) { access = false; break; }
      for (const p of res.posts) {
        const postId = (p.latePostId && ours.get(p.latePostId)) || (p._id && ours.get(p._id));
        if (!postId) continue;
        const entries = p.platforms?.length ? p.platforms : [{ platform: p.platform, platformPostUrl: p.platformPostUrl, analytics: p.analytics }];
        for (const e of entries) {
          if (e.platform !== "instagram" && e.platform !== "linkedin") continue;
          await upsertMetrics(brand.id, postId, e.platform, e.analytics ?? {}, e.platformPostUrl ?? null, p.publishedAt ?? null);
        }
      }
      if (page >= res.pages || res.posts.length < 100) break;
    }
    if (access) await syncFollowers(brand, profileId, from);
    await saveState(brand.id, { access, error: null });
  } catch (e) {
    const addon = e instanceof PostingError && (e.body.requiresAddon === true || e.status === 402 || e.status === 403);
    await saveState(brand.id, { access: addon ? false : before.access, error: addon ? null : e instanceof Error ? e.message : String(e) });
  }
  return syncState(brand.id);
}

async function upsertMetrics(brandId: string, postId: string, platform: Platform, m: ZMetrics, url: string | null, publishedAt: string | null) {
  await client()`
    insert into post_metrics (post_id, platform, brand_id, impressions, reach, views, likes, comments, shares, saves, clicks, follows, url, published_at, synced_at)
    values (${postId}, ${platform}, ${brandId}, ${n(m.impressions)}, ${n(m.reach)}, ${n(m.views)}, ${n(m.likes)}, ${n(m.comments)}, ${n(m.shares)}, ${n(m.saves)}, ${n(m.clicks)}, ${n(m.follows)}, ${url}, ${publishedAt}, now())
    on conflict (post_id, platform) do update set impressions = excluded.impressions, reach = excluded.reach, views = excluded.views,
      likes = excluded.likes, comments = excluded.comments, shares = excluded.shares, saves = excluded.saves, clicks = excluded.clicks,
      follows = excluded.follows, url = coalesce(excluded.url, post_metrics.url), published_at = coalesce(excluded.published_at, post_metrics.published_at), synced_at = now()`;
}

async function syncFollowers(brand: Brand, profileId: string, from: string) {
  const byAccount = await getFollowerStats(profileId, from);
  for (const a of brand.social.accounts) {
    for (const d of byAccount[a.id] ?? []) {
      if (!d.date || typeof d.followers !== "number") continue;
      await client()`insert into brand_followers (brand_id, platform, day, followers) values (${brand.id}, ${a.platform}, ${d.date.slice(0, 10)}, ${n(d.followers)})
        on conflict (brand_id, platform, day) do update set followers = excluded.followers`;
    }
  }
}

// ---------- reading results ----------
export type PostResult = {
  id: string; title: string; pillar: string; template: string; publish_on: string | null; spec: PostSpec;
  platforms: Platform[]; urls: Partial<Record<Platform, string>>;
  reach: number; impressions: number; views: number; engagements: number; likes: number; comments: number; shares: number; saves: number; clicks: number;
  /** Engagements per person reached (or per impression/view where reach isn't reported). */
  rate: number;
};

/** Every post with numbers, published in the last `days` days (or between from and to). */
export async function postResults(brandId: string, from: string, to: string): Promise<PostResult[]> {
  const rows = await client()`
    select p.id, p.title, p.pillar, p.spec, coalesce(min(m.published_at)::date, p.publish_on) as publish_on, coalesce(p.spec->>'template', '') as template,
      array_agg(m.platform) as platforms, jsonb_object_agg(m.platform, m.url) as urls,
      sum(m.reach)::int as reach, sum(m.impressions)::int as impressions, sum(m.views)::int as views,
      sum(m.likes)::int as likes, sum(m.comments)::int as comments, sum(m.shares)::int as shares, sum(m.saves)::int as saves, sum(m.clicks)::int as clicks
    from post_metrics m join posts p on p.id = m.post_id
    where m.brand_id = ${brandId} and coalesce(m.published_at::date, p.publish_on) between ${from} and ${to}
    group by p.id order by 5 desc nulls last`;
  return rows.map((r) => {
    const engagements = Number(r.likes) + Number(r.comments) + Number(r.shares) + Number(r.saves);
    const base = Number(r.reach) || Number(r.impressions) || Number(r.views);
    const urls = Object.fromEntries(Object.entries((r.urls ?? {}) as Record<string, string | null>).filter(([, v]) => v)) as Partial<Record<Platform, string>>;
    return {
      id: r.id as string, title: r.title as string, pillar: (r.pillar as string) ?? "", template: r.template as string,
      publish_on: r.publish_on ? (r.publish_on instanceof Date ? r.publish_on.toISOString().slice(0, 10) : String(r.publish_on).slice(0, 10)) : null,
      spec: r.spec as PostSpec, platforms: r.platforms as Platform[], urls,
      reach: Number(r.reach), impressions: Number(r.impressions), views: Number(r.views), engagements,
      likes: Number(r.likes), comments: Number(r.comments), shares: Number(r.shares), saves: Number(r.saves), clicks: Number(r.clicks),
      rate: base ? engagements / base : 0,
    };
  });
}

export type Totals = { posts: number; reach: number; engagements: number; clicks: number; rate: number };
export function totals(posts: PostResult[]): Totals {
  const reach = posts.reduce((s, p) => s + (p.reach || p.impressions || p.views), 0);
  const engagements = posts.reduce((s, p) => s + p.engagements, 0);
  return { posts: posts.length, reach, engagements, clicks: posts.reduce((s, p) => s + p.clicks, 0), rate: reach ? engagements / reach : 0 };
}

export type Group = { key: string; posts: number; avgReach: number; rate: number };
/** Average reach and engagement rate per design or per content theme. */
export function groupBy(posts: PostResult[], key: (p: PostResult) => string): Group[] {
  const m = new Map<string, PostResult[]>();
  for (const p of posts) m.set(key(p) || "Other", [...(m.get(key(p) || "Other") ?? []), p]);
  return [...m].map(([k, ps]) => {
    const t = totals(ps);
    return { key: k, posts: ps.length, avgReach: Math.round(t.reach / ps.length), rate: t.rate };
  // Groups with a single post can't say much: list them after the rest.
  }).sort((a, b) => Number(b.posts >= 2) - Number(a.posts >= 2) || b.rate - a.rate);
}

export type FollowerSeries = { platform: Platform; points: { day: string; followers: number }[] };
export async function followerSeries(brandId: string, from: string): Promise<FollowerSeries[]> {
  const rows = await client()`select platform, day, followers from brand_followers where brand_id = ${brandId} and day >= ${from} order by platform, day`;
  const out = new Map<Platform, FollowerSeries>();
  for (const r of rows) {
    const p = r.platform as Platform;
    if (!out.has(p)) out.set(p, { platform: p, points: [] });
    out.get(p)!.points.push({ day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10), followers: Number(r.followers) });
  }
  return [...out.values()];
}

/**
 * What has worked for this brand, written for the planner. Empty until there are enough
 * posts with numbers to say anything (8 or more in the last 90 days).
 */
export async function performanceNotes(brandId: string): Promise<string> {
  const to = dayIso(new Date());
  const posts = (await postResults(brandId, dayIso(new Date(Date.now() - 90 * 86400_000)), to).catch(() => [])).filter((p) => p.reach || p.impressions || p.views);
  if (posts.length < 8) return "";
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
  const all = totals(posts);
  const line = (g: Group) => `${g.key} (${g.posts} posts, ${pct(g.rate)} engagement, ${g.avgReach} average reach)`;
  const designs = groupBy(posts, (p) => p.template).filter((g) => g.posts >= 2);
  const themes = groupBy(posts, (p) => p.pillar).filter((g) => g.posts >= 2);
  const ranked = [...posts].sort((a, b) => b.rate - a.rate);
  return [
    `Results from the last 90 days (${posts.length} posts, ${pct(all.rate)} average engagement):`,
    designs.length ? `- Designs, best first: ${designs.map(line).join("; ")}` : "",
    themes.length ? `- Themes, best first: ${themes.map(line).join("; ")}` : "",
    `- Best posts: ${ranked.slice(0, 4).map((p) => `"${p.title}" (${p.template}, ${pct(p.rate)})`).join("; ")}`,
    `- Weakest posts: ${ranked.slice(-3).map((p) => `"${p.title}" (${p.template}, ${pct(p.rate)})`).join("; ")}`,
    "Lean towards what works: more of the stronger designs and themes and the angles of the best posts, fewer of the weakest, while keeping variety. " +
    "Small differences on few posts may be chance; don't drop a theme the brand needs.",
  ].filter(Boolean).join("\n");
}
