import { NextResponse } from "next/server";
import { z } from "zod";
import { revisePost } from "@/lib/ai";
import { getBrand, getPost, insertMedia, updatePost } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { describeFalError, queueVideo } from "@/lib/media";
import { startMedia } from "@/lib/pipeline";
import { unschedulePost } from "@/lib/publish";
import { TEMPLATES } from "@/lib/types";

export const maxDuration = 120;

const QUICK: Record<string, string> = {
  new_photo: "Use a different photo: write a fresh imagePrompt for a new scene that fits the post, and set newPhoto true.",
  shorter: "Make both captions about half as long. Keep the hook and the call to action.",
  different_design: "Redesign this post with a different template that suits the message. Keep the message the same.",
  make_carousel: "Turn this into a carousel (template carousel) of 5-8 slides: a cover, the key points expanded one per slide, and a closing cta slide. Keep the topic. If the post has a photo, keep it for the cover and set newPhoto false.",
};
const Body = z.object({ instruction: z.string().trim().max(1000).optional(), action: z.enum(["new_photo", "shorter", "different_design", "make_video", "make_carousel"]).optional() });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { instruction, action } = Body.parse(await req.json());
  const post = await getPost(id);
  if (!post) return notFound();
  const brand = await getBrand(post.brand_id);
  if (!brand) return notFound();
  // A changed post needs approving again before it goes out.
  if (post.status === "approved") {
    await unschedulePost(post);
    await updatePost(id, { status: "review" });
    post.status = "review";
  }

  // Turning a photo post into a video needs no rewrite: animate the photo it already has.
  if (action === "make_video") {
    const lines = post.spec.lines.length ? post.spec.lines : [post.spec.headline];
    if (post.spec.media?.url) {
      try {
        const job = await queueVideo(post.spec.motionPrompt || "Slow, subtle camera push-in with natural movement in the scene.", post.spec.media.url);
        await insertMedia({ brand_id: brand.id, post_id: post.id, role: "video", kind: "video", status: "pending", source: "ai", url: null, description: "Animated photo", fal_endpoint: job.endpoint, fal_request_id: job.requestId });
        return NextResponse.json(await updatePost(id, { status: "making", issue: null, spec: { ...post.spec, template: "video", lines, clip: null } }));
      } catch (e) {
        return NextResponse.json(await updatePost(id, { issue: `The video could not be started. ${describeFalError(e)}` }));
      }
    }
    const next = await updatePost(id, { spec: { ...post.spec, template: "video", lines, imagePrompt: post.spec.imagePrompt || `A scene that fits: ${post.title}` } });
    return NextResponse.json(await startMedia(brand, next!));
  }

  const ask = action ? QUICK[action] : instruction;
  if (!ask || ask.length < 3) return NextResponse.json({ error: "Say what to change." }, { status: 400 });
  const r = await revisePost(brand.profile, post, ask);
  const keepMedia = !r.newPhoto && TEMPLATES[r.spec.template].usesPhoto;
  const updated = await updatePost(id, {
    title: r.title, pillar: r.pillar, linkedin: r.linkedin, instagram: r.instagram,
    spec: { ...r.spec, media: keepMedia ? post.spec.media : null, clip: keepMedia && r.spec.template === "video" ? post.spec.clip : null },
  });
  // A new photo (or a photo design that has none yet) starts generating now.
  return NextResponse.json(await startMedia(brand, updated!));
});
