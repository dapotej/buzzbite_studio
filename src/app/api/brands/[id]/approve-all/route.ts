import { NextResponse } from "next/server";
import { listPostsByStatus, setPostsStatus } from "@/lib/db";
import { handle } from "@/lib/http";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const posts = await listPostsByStatus(id, ["review"]);
  await setPostsStatus(posts.map((p) => p.id), "approved");
  return NextResponse.json({ approved: posts.length });
});
