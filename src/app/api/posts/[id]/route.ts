import { NextResponse } from "next/server";
import { z } from "zod";
import { deletePost, updatePost } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { StoredPostSpecSchema } from "@/lib/types";

const Body = z.object({
  spec: StoredPostSpecSchema.optional(),
  linkedin: z.string().max(5000).optional(),
  instagram: z.string().max(5000).optional(),
  status: z.enum(["draft", "approved", "posted"]).optional(),
  publish_on: z.iso.date().nullable().optional(),
});

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const post = await updatePost(id, Body.parse(await req.json()));
  return post ? NextResponse.json(post) : notFound();
});

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await deletePost(id);
  return NextResponse.json({ ok: true });
});
