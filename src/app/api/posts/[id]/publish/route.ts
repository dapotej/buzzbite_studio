import { NextResponse } from "next/server";
import { z } from "zod";
import { getBrand, getPost } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { schedulePost, syncPost } from "@/lib/publish";

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
  if (post.status !== "approved") return NextResponse.json({ error: "Approve the post first." }, { status: 400 });
  return NextResponse.json(await schedulePost(brand, post, { now }));
});
