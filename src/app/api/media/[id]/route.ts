import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { deleteMedia, finishMedia, getBrand, getMediaRow } from "@/lib/db";
import { advance } from "@/lib/pipeline";
import { handle, notFound } from "@/lib/http";
import { checkJob } from "@/lib/media";

export const maxDuration = 60;

// Returns the item; while a generation is pending, asks fal.ai whether it has finished.
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const row = await getMediaRow(id);
  if (!row) return notFound();
  // Photos and clips made for a post go through the pipeline, which also updates the post.
  if (row.status === "pending" && row.post_id) {
    const brand = await getBrand(row.brand_id);
    if (brand) await advance(brand);
    return NextResponse.json(await getMediaRow(id));
  }
  if (row.status === "pending" && row.fal_endpoint && row.fal_request_id) {
    const out = await checkJob(row.fal_endpoint, row.fal_request_id, row.kind, row.brand_id);
    if (out.state === "done") await finishMedia(id, { status: "ready", url: out.url });
    if (out.state === "failed") await finishMedia(id, { status: "failed", error: out.error });
    if (out.state !== "pending") return NextResponse.json(await getMediaRow(id));
  }
  return NextResponse.json(row);
});

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const row = await deleteMedia(id);
  if (row?.url) await del(row.url).catch(() => undefined);
  return NextResponse.json({ ok: true });
});
