import { NextResponse } from "next/server";
import { z } from "zod";
import { revisePost } from "@/lib/ai";
import { getBrand, getPost, updatePost } from "@/lib/db";
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
  const revised = await revisePost(brand.profile, post, instruction);
  const saved = await updatePost(id, revised);
  return NextResponse.json(saved);
});
