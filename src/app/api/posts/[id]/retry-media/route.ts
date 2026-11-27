import { NextResponse } from "next/server";
import { getBrand, getPost, insertMedia, updatePost } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { describeFalError, queueVideo } from "@/lib/media";
import { startMedia } from "@/lib/pipeline";

export const maxDuration = 60;

/** Tries again to make the photo (or the video clip) a post is missing. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const post = await getPost(id);
  if (!post) return notFound();
  const brand = await getBrand(post.brand_id);
  if (!brand) return notFound();
  if (post.spec.template === "video" && post.spec.media?.url && !post.spec.clip) {
    try {
      const job = await queueVideo(post.spec.motionPrompt || "Slow, subtle camera push-in with natural movement in the scene.", post.spec.media.url);
      await insertMedia({ brand_id: brand.id, post_id: post.id, role: "video", kind: "video", status: "pending", source: "ai", url: null, description: "Animated photo", fal_endpoint: job.endpoint, fal_request_id: job.requestId });
      return NextResponse.json(await updatePost(id, { status: "making", issue: null }));
    } catch (e) {
      return NextResponse.json(await updatePost(id, { issue: `The video could not be started. ${describeFalError(e)}` }));
    }
  }
  const fresh = await updatePost(id, { spec: { ...post.spec, media: null, clip: null }, issue: null });
  return NextResponse.json(await startMedia(brand, fresh!));
});
