import { NextResponse } from "next/server";
import { z } from "zod";
import { deletePost, getBrand, getPost, setPublishing, updatePost } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { schedulePost, unschedulePost } from "@/lib/publish";
import { PLATFORMS, StoredPostSpecSchema } from "@/lib/types";

const Body = z.object({
  spec: StoredPostSpecSchema.optional(),
  linkedin: z.string().max(3000).optional(),
  instagram: z.string().max(2200).optional(),
  status: z.enum(["review", "approved", "posted"]).optional(),
  publish_on: z.iso.date().nullable().optional(),
  /** Platforms to post to; null for every connected account. */
  targets: z.array(z.enum(PLATFORMS)).min(1).nullable().optional(),
});

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { targets, ...body } = Body.parse(await req.json());
  const before = await getPost(id);
  if (!before) return notFound();
  const brand = await getBrand(before.brand_id);
  if (!brand) return notFound();

  // A new design needs a fresh look before it goes out.
  if (body.spec && before.status === "approved" && body.status === undefined) body.status = "review";
  let post = (await updatePost(id, body))!;
  if (targets !== undefined) post = (await setPublishing(id, { targets }))!;

  if (post.status !== "approved") {
    if (before.status === "approved") await unschedulePost(before);
  } else {
    const changed = before.status !== "approved" || targets !== undefined || body.publish_on !== undefined
      || body.linkedin !== undefined || body.instagram !== undefined || !post.publishing.zernioId;
    if (changed) post = await schedulePost(brand, post);
  }
  return NextResponse.json((await getPost(id)) ?? post);
});

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const post = await getPost(id);
  if (post) await unschedulePost(post);
  await deletePost(id);
  return NextResponse.json({ ok: true });
});
