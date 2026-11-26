import { NextResponse } from "next/server";
import { z } from "zod";
import { getBrand, getMediaRow, insertMedia } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { MediaError, queueImage, queueVideo } from "@/lib/media";

export const maxDuration = 60;

const Body = z.object({
  kind: z.enum(["image", "video"]),
  brief: z.string().trim().max(1000).default(""),
  sourceId: z.uuid().optional(), // the photo a clip is made from
});

/** Makes a photo from a description, or a 5-second clip from a library photo, in the brand's art direction. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return notFound();
  const b = Body.parse(await req.json());
  try {
    if (b.kind === "image") {
      if (b.brief.length < 3) return NextResponse.json({ error: "Describe the photo you want." }, { status: 400 });
      const prompt = `${b.brief}. Art direction: ${brand.profile.imageStyle || "natural, modern, premium photography"}. Portrait 4:5 framing. No text, letters, logos or signage.`;
      const job = await queueImage(prompt);
      return NextResponse.json(await insertMedia({ brand_id: id, kind: "image", status: "pending", source: "ai", url: null, description: b.brief, fal_endpoint: job.endpoint, fal_request_id: job.requestId }));
    }
    const source = b.sourceId ? await getMediaRow(b.sourceId) : null;
    if (!source || source.brand_id !== id || source.kind !== "image" || !source.url) {
      return NextResponse.json({ error: "Choose a ready photo from this brand's library to animate." }, { status: 400 });
    }
    const job = await queueVideo(b.brief || "Slow, subtle camera push-in with natural movement in the scene.", source.url);
    return NextResponse.json(await insertMedia({
      brand_id: id, kind: "video", status: "pending", source: "ai", url: null, description: `${source.description} (video)`,
      fal_endpoint: job.endpoint, fal_request_id: job.requestId,
    }));
  } catch (e) {
    if (e instanceof MediaError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof Error) return NextResponse.json({ error: `fal.ai refused the request: ${e.message}` }, { status: 502 });
    throw e;
  }
});
