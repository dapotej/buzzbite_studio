import { NextResponse } from "next/server";
import { getBrand, getPost } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { retryMedia } from "@/lib/pipeline";

export const maxDuration = 60;

/** Tries again to make the photo (or the video clip) a post is missing. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const post = await getPost(id);
  if (!post) return notFound();
  const brand = await getBrand(post.brand_id);
  if (!brand) return notFound();
  return NextResponse.json(await retryMedia(brand, post));
});
