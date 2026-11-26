import { NextResponse } from "next/server";
import { z } from "zod";
import { draftPost } from "@/lib/ai";
import { createPost, getBrand, getIdea, listMedia, setIdeaStatus } from "@/lib/db";
import { attachMedia } from "@/lib/posts";
import { handle, notFound } from "@/lib/http";

export const maxDuration = 120;

const Body = z.object({ ideaId: z.uuid(), publishOn: z.iso.date().nullable().default(null) });

export const POST = handle(async (req: Request) => {
  const { ideaId, publishOn } = Body.parse(await req.json());
  const idea = await getIdea(ideaId);
  if (!idea) return notFound();
  const brand = await getBrand(idea.brand_id);
  if (!brand) return notFound();
  const media = (await listMedia(brand.id)).filter((m) => m.status === "ready");
  const draft = await draftPost(brand.profile, idea, media);
  const post = await createPost({ brand_id: brand.id, idea_id: idea.id, publish_on: publishOn, ...attachMedia(draft, media) });
  await setIdeaStatus(idea.id, "used");
  return NextResponse.json({ id: post.id });
});
