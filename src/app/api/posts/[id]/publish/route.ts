import { NextResponse } from "next/server";
import { z } from "zod";
import { getBrand, getPost, updatePost } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { schedulePost, syncPost } from "@/lib/publish";

export const maxDuration = 120;

const Body = z.object({ now: z.boolean().default(false), check: z.boolean().default(false) });

/** Schedules an approved post again (after a failure), posts it now, or checks its result. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { now, check } = Body.parse(await req.json().catch(() => ({})));
  const post = await getPost(id);
  if (!post) return notFound();
  if (check) return NextResponse.json(await syncPost(post));
  const brand = await getBrand(post.brand_id);
  if (!brand) return notFound();
  if (post.status === "making") return NextResponse.json({ error: "Wait for the photo or video to finish." }, { status: 400 });
  if (post.status === "posted") return NextResponse.json({ error: "This post has already gone out." }, { status: 400 });
  // "Post now" on a post still in review approves it on the way out.
  if (post.status !== "approved") {
    if (!now) return NextResponse.json({ error: "Approve the post first." }, { status: 400 });
    const approved = await updatePost(id, { status: "approved" });
    return NextResponse.json(await schedulePost(brand, approved!, { now }));
  }
  return NextResponse.json(await schedulePost(brand, post, { now }));
});
