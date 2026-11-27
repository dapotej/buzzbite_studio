import { NextResponse } from "next/server";
import { z } from "zod";
import { getBrand, getPost, setPublishing } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { designKey } from "@/lib/types";

const File = z.object({
  url: z.url().refine((u) => new URL(u).hostname.endsWith(".public.blob.vercel-storage.com"), "Not a Buzzbite upload."),
  type: z.enum(["image", "video", "document"]),
  title: z.string().max(200).optional(),
});
const Body = z.object({ key: z.string().max(64), files: z.object({ instagram: z.array(File).min(1).max(10), linkedin: z.array(File).min(1).max(10) }) });

/** Saves the final files the browser made from a post, for posting. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { key, files } = Body.parse(await req.json());
  const post = await getPost(id);
  if (!post) return notFound();
  const brand = await getBrand(post.brand_id);
  if (!brand) return notFound();
  if (key !== designKey(post.spec, brand.updated_at)) {
    return NextResponse.json({ error: "The post changed while its files were being made. Try again." }, { status: 409 });
  }
  return NextResponse.json(await setPublishing(id, { files, filesKey: key }));
});
