import { NextResponse } from "next/server";
import { z } from "zod";
import { revisePost } from "@/lib/ai";
import { getBrand, getPost, listMedia, updatePost } from "@/lib/db";
import { attachMedia } from "@/lib/posts";
import { handle, notFound } from "@/lib/http";

export const maxDuration = 120;

const Body = z.object({ instruction: z.string().trim().min(3).max(1000) });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { instruction } = Body.parse(await req.json());
  const post = await getPost(id);
  if (!post) return notFound();
  const brand = await getBrand(post.brand_id);
  if (!brand) return notFound();
  const media = (await listMedia(brand.id)).filter((m) => m.status === "ready");
  const draft = await revisePost(brand.profile, post, instruction, media);
  // Keep the chosen photo unless the revision picked a different one.
  if (!draft.mediaId && post.spec.media) draft.mediaId = post.spec.media.id;
  const revised = attachMedia(draft, media);
  const saved = await updatePost(id, revised);
  return NextResponse.json(saved);
});
