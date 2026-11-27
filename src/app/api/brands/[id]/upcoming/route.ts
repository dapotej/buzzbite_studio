import { NextResponse } from "next/server";
import { listPostsByStatus } from "@/lib/db";
import { handle } from "@/lib/http";

/** Posts that have not gone out yet, dated today or later: the ones a brand-kit change should update. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const today = new Date().toISOString().slice(0, 10);
  const posts = (await listPostsByStatus(id, ["review", "approved"])).filter((p) => !p.publish_on || p.publish_on >= today);
  return NextResponse.json({ posts: posts.map((p) => ({ id: p.id, title: p.title, publish_on: p.publish_on, status: p.status })) });
});
