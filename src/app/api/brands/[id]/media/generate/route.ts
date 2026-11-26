import { NextResponse } from "next/server";
import { z } from "zod";
import { writeImagePrompt, writeVideoPrompt } from "@/lib/ai";
import { getBrand, getMediaRow, insertMedia } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { MediaError, queueImage, queueVideo } from "@/lib/media";

export const maxDuration = 60;

const Body = z.object({
  kind: z.enum(["image", "video"]),
  brief: z.string().trim().max(1000).default(""),
  sourceId: z.uuid().optional(), // the image a video is animated from
});

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return notFound();
  const b = Body.parse(await req.json());
  try {
    if (b.kind === "image") {
      if (b.brief.length < 3) return NextResponse.json({ error: "Describe the image you want." }, { status: 400 });
      const prompt = await writeImagePrompt(brand.profile, b.brief);
      const job = await queueImage(prompt);
      const media = await insertMedia({ brand_id: id, kind: "image", status: "pending", source: "ai", url: null, description: b.brief, fal_endpoint: job.endpoint, fal_request_id: job.requestId });
      return NextResponse.json(media);
    }
    const source = b.sourceId ? await getMediaRow(b.sourceId) : null;
    if (!source || source.brand_id !== id || source.kind !== "image" || !source.url) {
      return NextResponse.json({ error: "Choose a ready image from this brand's library to animate." }, { status: 400 });
    }
    const prompt = await writeVideoPrompt(brand.profile, source.description, b.brief);
    const job = await queueVideo(prompt, source.url);
    const media = await insertMedia({
      brand_id: id, kind: "video", status: "pending", source: "ai", url: null,
      description: b.brief ? `${source.description}, animated: ${b.brief}` : `${source.description}, animated`,
      fal_endpoint: job.endpoint, fal_request_id: job.requestId,
    });
    return NextResponse.json(media);
  } catch (e) {
    if (e instanceof MediaError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof Error && /fal|401|403|credentials/i.test(e.message)) {
      return NextResponse.json({ error: `fal.ai refused the request: ${e.message}` }, { status: 502 });
    }
    throw e;
  }
});
