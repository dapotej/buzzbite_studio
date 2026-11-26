import { NextResponse } from "next/server";
import { z } from "zod";
import { getBrand, insertMedia, listMedia } from "@/lib/db";
import { handle, notFound } from "@/lib/http";

const Body = z.object({
  url: z.url().refine((u) => new URL(u).hostname.endsWith(".public.blob.vercel-storage.com"), "Not a SocialPilot upload."),
  kind: z.enum(["image", "video"]),
  description: z.string().trim().max(500).default(""),
});

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return NextResponse.json(await listMedia(id));
});

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!(await getBrand(id))) return notFound();
  const b = Body.parse(await req.json());
  const media = await insertMedia({ brand_id: id, kind: b.kind, status: "ready", source: "upload", url: b.url, description: b.description });
  return NextResponse.json(media);
});
