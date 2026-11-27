import "server-only";
import { neon } from "@neondatabase/serverless";
import { requireSession } from "./accounts";
import { noteAlert, resolveAlerts } from "./alerts";
import { recordFal } from "./usage";
import { EMPTY_PUBLISHING, type Brand, type BrandProfile, type BrandSettings, type BrandSocial, type Idea, type Media, type Post, type PostSpec, type PostStatus, type Publishing, type TrendItem, type TrendReport } from "./types";

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

// Every read and write is limited to the signed-in user's workspace.
async function currentWorkspace(): Promise<string> {
  return (await requireSession()).workspace.id;
}

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const day = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/** Fills fields added after a brand was saved, so older rows keep working. */
function normalizeProfile(p: BrandProfile): BrandProfile {
  return { ...p, imageStyle: p.imageStyle ?? "", colors: { ...p.colors, supporting: p.colors?.supporting ?? [] } };
}
function toBrand(r: Row): Brand {
  const s = (r.settings ?? {}) as Partial<BrandSettings>;
  return {
    id: r.id as string,
    name: r.name as string,
    profile: normalizeProfile(r.profile as BrandProfile),
    settings: { days: Array.isArray(s.days) && s.days.length ? s.days : [0, 2, 4], time: s.time || "10:00", tz: s.tz || "Africa/Lagos", references: Array.isArray(s.references) ? s.references : [], voice: s.voice || "Rachel" },
    logo_on_light: (r.logo_on_light as string) ?? null,
    logo_on_dark: (r.logo_on_dark as string) ?? null,
    social: { profileId: null, accounts: [], ...((r.social ?? {}) as Partial<BrandSocial>) },
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}
/** Fills fields added after a post was saved, so older posts render and revise safely. */
function normalizeSpec(s: Partial<PostSpec>): PostSpec {
  return {
    template: s.template ?? "statement", theme: s.theme ?? "dark", kicker: s.kicker ?? "", headline: s.headline ?? "", sub: s.sub ?? "",
    note: s.note ?? "", big: s.big ?? "", bigLabel: s.bigLabel ?? "", items: s.items ?? [], bubbles: s.bubbles ?? [], lines: s.lines ?? [],
    endline: s.endline ?? "", cta: s.cta ?? "", imagePrompt: s.imagePrompt ?? "", motionPrompt: s.motionPrompt ?? "", showsProduct: s.showsProduct ?? false,
    slides: s.slides ?? [], scenes: s.scenes ?? [], music: s.music ?? "", reel: s.reel ?? null,
    media: s.media ?? null, clip: s.clip ?? null,
  };
}
function toPost(r: Row): Post {
  const status = r.status === "draft" ? "review" : (r.status as PostStatus);
  return {
    id: r.id as string,
    brand_id: r.brand_id as string,
    idea_id: (r.idea_id as string) ?? null,
    publish_on: day(r.publish_on),
    status,
    issue: (r.issue as string) ?? null,
    title: (r.title as string) ?? "",
    pillar: (r.pillar as string) ?? "",
    spec: normalizeSpec(r.spec as Partial<PostSpec>),
    linkedin: r.linkedin as string,
    instagram: r.instagram as string,
    publishing: { ...EMPTY_PUBLISHING, ...((r.publishing ?? {}) as Partial<Publishing>) },
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}
function toMedia(r: Row): Media {
  return {
    id: r.id as string,
    brand_id: r.brand_id as string,
    post_id: (r.post_id as string) ?? null,
    role: (r.role as Media["role"]) ?? null,
    kind: r.kind as Media["kind"],
    status: r.status as Media["status"],
    source: r.source as Media["source"],
    url: (r.url as string) ?? null,
    description: r.description as string,
    error: (r.error as string) ?? null,
    created_at: iso(r.created_at),
  };
}
const toIdea = (r: Row): Idea => ({ ...(r as unknown as Idea), created_at: iso(r.created_at) });

// ---------- brands ----------
export async function listBrands(): Promise<Brand[]> {
  const ws = await currentWorkspace();
  return (await client()`select * from brands where workspace_id = ${ws} order by created_at`).map(toBrand);
}
export async function getBrand(id: string): Promise<Brand | null> {
  const ws = await currentWorkspace();
  const rows = await client()`select * from brands where id = ${id} and workspace_id = ${ws}`;
  return rows[0] ? toBrand(rows[0]) : null;
}
export async function createBrand(profile: BrandProfile, logos?: { light: string | null; dark: string | null }): Promise<Brand> {
  const ws = await currentWorkspace();
  const rows = await client()`insert into brands (workspace_id, name, profile, logo_on_light, logo_on_dark)
    values (${ws}, ${profile.name}, ${JSON.stringify(profile)}::jsonb, ${logos?.light ?? null}, ${logos?.dark ?? null}) returning *`;
  return toBrand(rows[0]);
}
export async function updateBrand(
  id: string,
  patch: { profile?: BrandProfile; settings?: BrandSettings; logo_on_light?: string | null; logo_on_dark?: string | null },
): Promise<Brand | null> {
  const cur = await getBrand(id);
  if (!cur) return null;
  const profile = patch.profile ?? cur.profile;
  const settings = patch.settings ?? cur.settings;
  const onLight = patch.logo_on_light !== undefined ? patch.logo_on_light : cur.logo_on_light;
  const onDark = patch.logo_on_dark !== undefined ? patch.logo_on_dark : cur.logo_on_dark;
  const rows = await client()`update brands set name = ${profile.name}, profile = ${JSON.stringify(profile)}::jsonb,
    settings = ${JSON.stringify(settings)}::jsonb, logo_on_light = ${onLight}, logo_on_dark = ${onDark}, updated_at = now()
    where id = ${id} returning *`;
  return toBrand(rows[0]);
}
export async function deleteBrand(id: string): Promise<void> {
  const ws = await currentWorkspace();
  await client()`delete from brands where id = ${id} and workspace_id = ${ws}`;
}

// ---------- posts ----------
export async function listPostsBetween(brandId: string, from: string, to: string): Promise<Post[]> {
  return (await client()`select * from posts where brand_id = ${brandId} and brand_id in (select id from brands where workspace_id = ${await currentWorkspace()}) and publish_on between ${from} and ${to} order by publish_on, created_at`).map(toPost);
}
export async function listPostsByStatus(brandId: string, statuses: PostStatus[]): Promise<Post[]> {
  return (await client()`select * from posts where brand_id = ${brandId} and brand_id in (select id from brands where workspace_id = ${await currentWorkspace()}) and status = any(${statuses}) order by publish_on nulls last, created_at`).map(toPost);
}
export async function recentPostTitles(brandId: string): Promise<string[]> {
  const rows = (await client()`select title from posts where brand_id = ${brandId} and title <> '' order by created_at desc limit 60`) as { title: string }[];
  return rows.map((r) => r.title);
}
export async function getPost(id: string): Promise<Post | null> {
  const rows = await client()`select * from posts where id = ${id} and brand_id in (select id from brands where workspace_id = ${await currentWorkspace()})`;
  return rows[0] ? toPost(rows[0]) : null;
}
export async function createPost(p: {
  brand_id: string;
  idea_id?: string | null;
  publish_on: string | null;
  status: PostStatus;
  title: string;
  pillar: string;
  spec: PostSpec;
  linkedin: string;
  instagram: string;
}): Promise<Post> {
  const rows = await client()`insert into posts (brand_id, idea_id, publish_on, status, title, pillar, spec, linkedin, instagram)
    values (${p.brand_id}, ${p.idea_id ?? null}, ${p.publish_on}, ${p.status}, ${p.title}, ${p.pillar}, ${JSON.stringify(p.spec)}::jsonb, ${p.linkedin}, ${p.instagram}) returning *`;
  return toPost(rows[0]);
}
export async function updatePost(
  id: string,
  patch: Partial<Pick<Post, "spec" | "linkedin" | "instagram" | "status" | "publish_on" | "title" | "pillar" | "issue">>,
): Promise<Post | null> {
  const cur = await getPost(id);
  if (!cur) return null;
  const n = { ...cur, ...patch };
  const rows = await client()`update posts set spec = ${JSON.stringify(n.spec)}::jsonb, linkedin = ${n.linkedin}, instagram = ${n.instagram},
    status = ${n.status}, publish_on = ${n.publish_on}, title = ${n.title}, pillar = ${n.pillar}, issue = ${n.issue}, updated_at = now()
    where id = ${id} returning *`;
  const post = toPost(rows[0]);
  if ("issue" in patch && patch.issue !== cur.issue) {
    if (patch.issue) await noteAlert(post, "media", patch.issue);
    else await resolveAlerts(post.id, "media");
  }
  return post;
}
/** Saves auto-posting state without touching updated_at, which keys the post's design. */
export async function setPublishing(id: string, patch: Partial<Publishing>): Promise<Post | null> {
  const cur = await getPost(id);
  if (!cur) return null;
  const next = { ...cur.publishing, ...patch };
  const rows = await client()`update posts set publishing = ${JSON.stringify(next)}::jsonb where id = ${id} returning *`;
  const post = toPost(rows[0]);
  const failed = next.state === "failed" || next.state === "partial";
  if (next.error && (next.error !== cur.publishing.error || next.state !== cur.publishing.state)) await noteAlert(post, failed ? "publish" : "schedule", next.error);
  else if (failed && cur.publishing.state !== next.state) await noteAlert(post, "publish", "The post did not go out on every platform.");
  else if (!next.error && !failed) await resolveAlerts(post.id);
  return post;
}
/** Posts handed to the posting service that have not finished yet. */
export async function listPostsInFlight(brandId: string): Promise<Post[]> {
  return (await client()`select * from posts where brand_id = ${brandId} and publishing->>'zernioId' is not null
    and publishing->>'state' in ('scheduled', 'publishing') order by publish_on`).map(toPost);
}
export async function setBrandSocial(id: string, social: BrandSocial): Promise<void> {
  await client()`update brands set social = ${JSON.stringify(social)}::jsonb where id = ${id}`;
}
export async function setPostsStatus(ids: string[], status: PostStatus): Promise<void> {
  if (ids.length) await client()`update posts set status = ${status}, updated_at = now() where id = any(${ids}) and brand_id in (select id from brands where workspace_id = ${await currentWorkspace()})`;
}
export async function deletePost(id: string): Promise<void> {
  await client()`delete from posts where id = ${id} and brand_id in (select id from brands where workspace_id = ${await currentWorkspace()})`;
}

// ---------- media ----------
export type MediaRow = Media & { fal_endpoint: string | null; fal_request_id: string | null };
export async function listMedia(brandId: string): Promise<Media[]> {
  return (await client()`select * from media where brand_id = ${brandId} and brand_id in (select id from brands where workspace_id = ${await currentWorkspace()}) and status <> 'failed' order by created_at desc limit 200`).map(toMedia);
}
export async function listPendingMedia(brandId: string): Promise<MediaRow[]> {
  const rows = await client()`select * from media where brand_id = ${brandId} and status = 'pending' order by created_at`;
  return rows.map((r) => ({ ...toMedia(r), fal_endpoint: (r.fal_endpoint as string) ?? null, fal_request_id: (r.fal_request_id as string) ?? null }));
}
export async function getMediaRow(id: string): Promise<MediaRow | null> {
  const rows = await client()`select * from media where id = ${id} and brand_id in (select id from brands where workspace_id = ${await currentWorkspace()})`;
  if (!rows[0]) return null;
  return { ...toMedia(rows[0]), fal_endpoint: (rows[0].fal_endpoint as string) ?? null, fal_request_id: (rows[0].fal_request_id as string) ?? null };
}
export async function insertMedia(m: {
  brand_id: string;
  post_id?: string | null;
  role?: Media["role"];
  kind: Media["kind"];
  status: Media["status"];
  source: Media["source"];
  url: string | null;
  description: string;
  fal_endpoint?: string | null;
  fal_request_id?: string | null;
}): Promise<Media> {
  const rows = await client()`insert into media (brand_id, post_id, role, kind, status, source, url, description, fal_endpoint, fal_request_id)
    values (${m.brand_id}, ${m.post_id ?? null}, ${m.role ?? null}, ${m.kind}, ${m.status}, ${m.source}, ${m.url}, ${m.description}, ${m.fal_endpoint ?? null}, ${m.fal_request_id ?? null}) returning *`;
  return toMedia(rows[0]);
}
export async function finishMedia(id: string, patch: { status: "ready"; url: string } | { status: "failed"; error: string }): Promise<void> {
  if (patch.status === "ready") {
    const rows = await client()`update media set status = 'ready', url = ${patch.url}, error = null where id = ${id} and status <> 'ready'
      returning brand_id, post_id, fal_endpoint, role`;
    if (rows[0]) await recordFal(rows[0] as { brand_id: string; post_id: string | null; fal_endpoint: string | null; role: string | null });
  }
  else await client()`update media set status = 'failed', error = ${patch.error} where id = ${id}`;
}
export async function deleteMedia(id: string): Promise<MediaRow | null> {
  const row = await getMediaRow(id);
  if (row) await client()`delete from media where id = ${id}`;
  return row;
}

// ---------- ideas (kept for posts created from older flows) ----------
export async function insertIdea(brandId: string, i: Pick<Idea, "title" | "angle" | "pillar" | "format">): Promise<Idea> {
  const rows = await client()`insert into ideas (brand_id, title, angle, pillar, format) values (${brandId}, ${i.title}, ${i.angle}, ${i.pillar}, ${i.format}) returning *`;
  return toIdea(rows[0]);
}

// ---------- trend radar ----------
const toReport = (r: Row): TrendReport => ({ id: r.id as string, brand_id: r.brand_id as string, summary: r.summary as string, items: r.items as TrendItem[], created_at: iso(r.created_at) });
export async function latestTrendReport(brandId: string): Promise<TrendReport | null> {
  const rows = await client()`select * from trend_reports where brand_id = ${brandId} and brand_id in (select id from brands where workspace_id = ${await currentWorkspace()}) order by created_at desc limit 1`;
  return rows[0] ? toReport(rows[0]) : null;
}
export async function getTrendReport(id: string): Promise<TrendReport | null> {
  const rows = await client()`select * from trend_reports where id = ${id} and brand_id in (select id from brands where workspace_id = ${await currentWorkspace()})`;
  return rows[0] ? toReport(rows[0]) : null;
}
export async function insertTrendReport(brandId: string, summary: string, items: TrendItem[]): Promise<TrendReport> {
  const rows = await client()`insert into trend_reports (brand_id, summary, items) values (${brandId}, ${summary}, ${JSON.stringify(items)}::jsonb) returning *`;
  return toReport(rows[0]);
}
export async function updateTrendItems(id: string, items: TrendItem[]): Promise<void> {
  await client()`update trend_reports set items = ${JSON.stringify(items)}::jsonb where id = ${id}`;
}

// ---------- leads (website sign-ups) ----------
export type Lead = { id: string; kind: string; email: string; name: string; company: string; handle: string; message: string; source: string; created_at: string };
export async function insertLead(l: Omit<Lead, "id" | "created_at">): Promise<void> {
  await client()`insert into leads (kind, email, name, company, handle, message, source)
    values (${l.kind}, ${l.email}, ${l.name}, ${l.company}, ${l.handle}, ${l.message}, ${l.source})`;
}
export async function listLeads(): Promise<Lead[]> {
  return (await client()`select * from leads order by created_at desc limit 500`).map((r) => ({ ...(r as Lead), created_at: iso(r.created_at) }));
}
export async function countPendingMedia(postId: string): Promise<number> {
  return Number(((await client()`select count(*)::int as n from media where post_id = ${postId} and status = 'pending'`)[0] as { n: number }).n);
}
