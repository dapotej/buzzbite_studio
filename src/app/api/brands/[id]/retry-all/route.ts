import { NextResponse } from "next/server";
import { getBrand, listPostsByStatus } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { retryMedia } from "@/lib/pipeline";

export const maxDuration = 120;

/** Tries again for every post whose photo or video could not be made. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return notFound();
  const posts = (await listPostsByStatus(id, ["review", "approved"])).filter((p) => p.issue);
  const results = [];
  for (const p of posts) results.push(await retryMedia(brand, p));
  return NextResponse.json({ retried: posts.length, failed: results.filter((r) => r.issue).length, issue: results.find((r) => r.issue)?.issue ?? null });
});
