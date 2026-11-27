import "server-only";
import { neon } from "@neondatabase/serverless";
import { sendEmail } from "./email";
import type { Post } from "./types";

// Alerts: things that went wrong while no one was watching (a photo that failed, a post that
// did not go out). Shown on the calendar until fixed, and emailed for failed posts.
// Not scoped by session: webhooks and the daily check write them too. Reads are by workspace.

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

export type AlertKind = "media" | "schedule" | "publish";
export type Alert = { id: string; workspace_id: string; brand_id: string; post_id: string | null; kind: AlertKind; message: string; created_at: string; brand_name: string; post_title: string | null; publish_on: string | null };

/** Records an open alert for the post, once: a repeat updates the message. */
export async function noteAlert(post: Post, kind: AlertKind, message: string): Promise<void> {
  try {
    const rows = await client()`
      with b as (select id, workspace_id, name from brands where id = ${post.brand_id})
      insert into alerts (workspace_id, brand_id, post_id, kind, message)
      select b.workspace_id, b.id, ${post.id}, ${kind}, ${message.slice(0, 600)} from b
      on conflict (post_id, kind) where resolved_at is null do update set message = excluded.message
      returning (xmax = 0) as fresh, (select name from b) as brand_name, workspace_id`;
    const r = rows[0] as { fresh: boolean; brand_name: string; workspace_id: string } | undefined;
    if (r?.fresh && kind === "publish") await emailOwners(r.workspace_id, `A ${r.brand_name} post did not go out`,
      `"${post.title}" could not be posted.\n\n${message}\n\nOpen Buzzbite to fix it: ${appUrl()}/b/${post.brand_id}/review`);
  } catch (e) {
    console.error("could not save alert", e); // never let an alert break the work it reports on
  }
}

export async function resolveAlerts(postId: string, kind?: AlertKind): Promise<void> {
  try {
    if (kind) await client()`update alerts set resolved_at = now() where post_id = ${postId} and kind = ${kind} and resolved_at is null`;
    else await client()`update alerts set resolved_at = now() where post_id = ${postId} and resolved_at is null`;
  } catch (e) {
    console.error("could not resolve alerts", e);
  }
}

export async function listOpenAlerts(workspaceId: string, brandId?: string): Promise<Alert[]> {
  const rows = await client()`
    select a.*, b.name as brand_name, p.title as post_title, p.publish_on from alerts a
    join brands b on b.id = a.brand_id left join posts p on p.id = a.post_id
    where a.workspace_id = ${workspaceId} and a.resolved_at is null and (${brandId ?? null}::uuid is null or a.brand_id = ${brandId ?? null})
    order by a.created_at desc limit 50`;
  return rows.map((r) => ({
    id: r.id as string, workspace_id: r.workspace_id as string, brand_id: r.brand_id as string, post_id: (r.post_id as string) ?? null,
    kind: r.kind as AlertKind, message: r.message as string, created_at: iso(r.created_at), brand_name: r.brand_name as string,
    post_title: (r.post_title as string) ?? null, publish_on: r.publish_on ? iso(r.publish_on).slice(0, 10) : null,
  }));
}

export async function dismissAlert(workspaceId: string, id: string): Promise<void> {
  await client()`update alerts set resolved_at = now() where id = ${id} and workspace_id = ${workspaceId}`;
}

export const appUrl = () => (process.env.APP_URL || "https://app.buzzbite.io").replace(/\/$/, "");

async function emailOwners(workspaceId: string, subject: string, text: string) {
  const rows = await client()`select u.email from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${workspaceId}`;
  const to = rows.map((r) => r.email as string);
  if (to.length) await sendEmail(to, subject, text);
}
