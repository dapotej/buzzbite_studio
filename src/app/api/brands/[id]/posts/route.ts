import { NextResponse } from "next/server";
import { z } from "zod";
import { draftOne } from "@/lib/ai";
import { postAllowance } from "@/lib/limits";
import { getBrand, listPostsBetween } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { savePost } from "@/lib/pipeline";

export const maxDuration = 120;

const Body = z.object({
  date: z.iso.date(),
  brief: z.string().trim().max(1000).default(""),
  format: z.enum(["any", "photo", "video", "reel", "carousel", "graphic"]).default("any"),
});

/** Creates one finished post for a chosen day, optionally about something specific. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return notFound();
  const { date, brief, format } = Body.parse(await req.json());
  const sameDay = await listPostsBetween(id, date, date);
  const formatNote = format === "photo" ? " Use a photo template." : format === "video" ? " Use the video template." : format === "reel" ? " Use the reel template: 3-4 scenes with voice-over and a music brief." : format === "carousel" ? " Use the carousel template with 5-8 slides." : format === "graphic" ? " Use a graphic template (no photo)." : "";
  const ask = (brief || "Choose the best topic for this date from the brand's pillars and the season.") + formatNote +
    (sameDay.length ? ` There is already a post that day: "${sameDay.map((p) => p.title).join('", "')}". Make this one different.` : "");
  await postAllowance(); // plan limit: posts per month
  const draft = await draftOne(brand.profile, ask, date);
  const post = await savePost(brand, draft, date);
  return NextResponse.json({ id: post.id });
});
