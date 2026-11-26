import { NextResponse } from "next/server";
import { z } from "zod";
import { draftPost } from "@/lib/ai";
import { createPost, getBrand, getTrendReport, insertIdea, listMedia, setIdeaStatus } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { attachMedia } from "@/lib/posts";

export const maxDuration = 120;

const Body = z.object({ index: z.number().int().min(0) });

// Turns one trend recommendation into an idea and a drafted post.
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { index } = Body.parse(await req.json());
  const report = await getTrendReport(id);
  const item = report?.items[index];
  if (!report || !item) return notFound();
  const brand = await getBrand(report.brand_id);
  if (!brand) return notFound();
  const idea = await insertIdea(brand.id, {
    title: item.title,
    angle: `${item.whyNow} ${item.recommendation}`,
    pillar: item.pillar,
    format: item.format,
  });
  const media = await listMedia(brand.id);
  const draft = await draftPost(brand.profile, idea, media.filter((m) => m.status === "ready"));
  const post = await createPost({ brand_id: brand.id, idea_id: idea.id, publish_on: null, ...attachMedia(draft, media) });
  await setIdeaStatus(idea.id, "used");
  return NextResponse.json({ id: post.id });
});
