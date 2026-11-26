import "server-only";
import { neon } from "@neondatabase/serverless";
import type { Brand, BrandProfile, Idea, Media, Post, PostSpec, TrendItem, TrendReport } from "./types";

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

// v1 is single-tenant: everything lives in one workspace. The schema is
// already multi-tenant, so a signed-in user's workspace can replace this later.
let workspaceId: string | null = null;
async function currentWorkspace(): Promise<string> {
  if (workspaceId) return workspaceId;
  const sql = client();
  const rows = (await sql`select id from workspaces order by created_at limit 1`) as { id: string }[];
  if (rows[0]) return (workspaceId = rows[0].id);
  const created = (await sql`insert into workspaces (name) values ('My workspace') returning id`) as { id: string }[];
  return (workspaceId = created[0].id);
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const day = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/** Fills fields added after a brand was saved, so older rows keep working. */
function normalizeProfile(p: BrandProfile): BrandProfile {
  return { ...p, imageStyle: p.imageStyle ?? "", colors: { ...p.colors, supporting: p.colors.supporting ?? [] } };
}

function toBrand(r: Record<string, unknown>): Brand {
  return {
    id: r.id as string,
    name: r.name as string,
    profile: normalizeProfile(r.profile as BrandProfile),
    logo_on_light: (r.logo_on_light as string) ?? null,
    logo_on_dark: (r.logo_on_dark as string) ?? null,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}
function toPost(r: Record<string, unknown>): Post {
  return {
    id: r.id as string,
    brand_id: r.brand_id as string,
    idea_id: (r.idea_id as string) ?? null,
    publish_on: day(r.publish_on),
    status: r.status as Post["status"],
    spec: r.spec as PostSpec,
    linkedin: r.linkedin as string,
    instagram: r.instagram as string,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}
function toIdea(r: Record<string, unknown>): Idea {
  return { ...(r as unknown as Idea), created_at: iso(r.created_at) };
}

// ---------- brands ----------
export async function listBrands(): Promise<Brand[]> {
  const ws = await currentWorkspace();
  const rows = await client()`select * from brands where workspace_id = ${ws} order by created_at`;
  return rows.map(toBrand);
}
export async function getBrand(id: string): Promise<Brand | null> {
  const ws = await currentWorkspace();
  const rows = await client()`select * from brands where id = ${id} and workspace_id = ${ws}`;
  return rows[0] ? toBrand(rows[0]) : null;
}
export async function createBrand(profile: BrandProfile): Promise<Brand> {
  const ws = await currentWorkspace();
  const rows = await client()`insert into brands (workspace_id, name, profile)
    values (${ws}, ${profile.name}, ${JSON.stringify(profile)}::jsonb) returning *`;
  return toBrand(rows[0]);
}
export async function updateBrand(
  id: string,
  patch: { profile?: BrandProfile; logo_on_light?: string | null; logo_on_dark?: string | null },
): Promise<Brand | null> {
  const current = await getBrand(id);
  if (!current) return null;
  const profile = patch.profile ?? current.profile;
  const onLight = patch.logo_on_light !== undefined ? patch.logo_on_light : current.logo_on_light;
  const onDark = patch.logo_on_dark !== undefined ? patch.logo_on_dark : current.logo_on_dark;
  const rows = await client()`update brands set name = ${profile.name}, profile = ${JSON.stringify(profile)}::jsonb,
    logo_on_light = ${onLight}, logo_on_dark = ${onDark}, updated_at = now()
    where id = ${id} returning *`;
  return toBrand(rows[0]);
}
export async function deleteBrand(id: string): Promise<void> {
  const ws = await currentWorkspace();
  await client()`delete from brands where id = ${id} and workspace_id = ${ws}`;
}

// ---------- ideas ----------
export async function listIdeas(brandId: string): Promise<Idea[]> {
  const rows = await client()`select * from ideas where brand_id = ${brandId} and status = 'new' order by created_at desc limit 60`;
  return rows.map(toIdea);
}
export async function getIdea(id: string): Promise<Idea | null> {
  const rows = await client()`select * from ideas where id = ${id}`;
  return rows[0] ? toIdea(rows[0]) : null;
}
export async function recentIdeaTitles(brandId: string): Promise<string[]> {
  const rows = (await client()`select title from ideas where brand_id = ${brandId} order by created_at desc limit 80`) as { title: string }[];
  return rows.map((r) => r.title);
}
export async function insertIdeas(brandId: string, ideas: Omit<Idea, "id" | "brand_id" | "status" | "created_at">[]): Promise<void> {
  const sql = client();
  for (const i of ideas) {
    await sql`insert into ideas (brand_id, title, angle, pillar, format) values (${brandId}, ${i.title}, ${i.angle}, ${i.pillar}, ${i.format})`;
  }
}
export async function setIdeaStatus(id: string, status: Idea["status"]): Promise<void> {
  await client()`update ideas set status = ${status} where id = ${id}`;
}

// ---------- posts ----------
export async function listPosts(brandId: string): Promise<Post[]> {
  const rows = await client()`select * from posts where brand_id = ${brandId} order by publish_on nulls last, created_at desc`;
  return rows.map(toPost);
}
export async function getPost(id: string): Promise<Post | null> {
  const rows = await client()`select * from posts where id = ${id}`;
  return rows[0] ? toPost(rows[0]) : null;
}
export async function createPost(p: {
  brand_id: string;
  idea_id: string | null;
  publish_on: string | null;
  spec: PostSpec;
  linkedin: string;
  instagram: string;
}): Promise<Post> {
  const rows = await client()`insert into posts (brand_id, idea_id, publish_on, spec, linkedin, instagram)
    values (${p.brand_id}, ${p.idea_id}, ${p.publish_on}, ${JSON.stringify(p.spec)}::jsonb, ${p.linkedin}, ${p.instagram}) returning *`;
  return toPost(rows[0]);
}
export async function updatePost(
  id: string,
  patch: Partial<Pick<Post, "spec" | "linkedin" | "instagram" | "status" | "publish_on">>,
): Promise<Post | null> {
  const cur = await getPost(id);
  if (!cur) return null;
  const n = { ...cur, ...patch };
  const rows = await client()`update posts set spec = ${JSON.stringify(n.spec)}::jsonb, linkedin = ${n.linkedin},
    instagram = ${n.instagram}, status = ${n.status}, publish_on = ${n.publish_on}, updated_at = now()
    where id = ${id} returning *`;
  return toPost(rows[0]);
}
export async function deletePost(id: string): Promise<void> {
  await client()`delete from posts where id = ${id}`;
}

// ---------- media ----------
function toMedia(r: Record<string, unknown>): Media {
  return {
    id: r.id as string,
    brand_id: r.brand_id as string,
    kind: r.kind as Media["kind"],
    status: r.status as Media["status"],
    source: r.source as Media["source"],
    url: (r.url as string) ?? null,
    description: r.description as string,
    error: (r.error as string) ?? null,
    created_at: iso(r.created_at),
  };
}
export type MediaRow = Media & { fal_endpoint: string | null; fal_request_id: string | null };

export async function listMedia(brandId: string): Promise<Media[]> {
  const rows = await client()`select * from media where brand_id = ${brandId} and status <> 'failed' order by created_at desc limit 200`;
  return rows.map(toMedia);
}
export async function getMediaRow(id: string): Promise<MediaRow | null> {
  const rows = await client()`select * from media where id = ${id}`;
  if (!rows[0]) return null;
  return { ...toMedia(rows[0]), fal_endpoint: (rows[0].fal_endpoint as string) ?? null, fal_request_id: (rows[0].fal_request_id as string) ?? null };
}
export async function insertMedia(m: {
  brand_id: string;
  kind: Media["kind"];
  status: Media["status"];
  source: Media["source"];
  url: string | null;
  description: string;
  fal_endpoint?: string | null;
  fal_request_id?: string | null;
}): Promise<Media> {
  const rows = await client()`insert into media (brand_id, kind, status, source, url, description, fal_endpoint, fal_request_id)
    values (${m.brand_id}, ${m.kind}, ${m.status}, ${m.source}, ${m.url}, ${m.description}, ${m.fal_endpoint ?? null}, ${m.fal_request_id ?? null}) returning *`;
  return toMedia(rows[0]);
}
export async function finishMedia(id: string, patch: { status: "ready"; url: string } | { status: "failed"; error: string }): Promise<void> {
  if (patch.status === "ready") await client()`update media set status = 'ready', url = ${patch.url}, error = null where id = ${id}`;
  else await client()`update media set status = 'failed', error = ${patch.error} where id = ${id}`;
}
export async function deleteMedia(id: string): Promise<MediaRow | null> {
  const row = await getMediaRow(id);
  if (row) await client()`delete from media where id = ${id}`;
  return row;
}

// ---------- trend radar ----------
function toReport(r: Record<string, unknown>): TrendReport {
  return { id: r.id as string, brand_id: r.brand_id as string, summary: r.summary as string, items: r.items as TrendItem[], created_at: iso(r.created_at) };
}
export async function latestTrendReport(brandId: string): Promise<TrendReport | null> {
  const rows = await client()`select * from trend_reports where brand_id = ${brandId} order by created_at desc limit 1`;
  return rows[0] ? toReport(rows[0]) : null;
}
export async function getTrendReport(id: string): Promise<TrendReport | null> {
  const rows = await client()`select * from trend_reports where id = ${id}`;
  return rows[0] ? toReport(rows[0]) : null;
}
export async function insertTrendReport(brandId: string, summary: string, items: TrendItem[]): Promise<TrendReport> {
  const rows = await client()`insert into trend_reports (brand_id, summary, items) values (${brandId}, ${summary}, ${JSON.stringify(items)}::jsonb) returning *`;
  return toReport(rows[0]);
}
export async function insertIdea(brandId: string, i: Pick<Idea, "title" | "angle" | "pillar" | "format">): Promise<Idea> {
  const rows = await client()`insert into ideas (brand_id, title, angle, pillar, format) values (${brandId}, ${i.title}, ${i.angle}, ${i.pillar}, ${i.format}) returning *`;
  return toIdea(rows[0]);
}
