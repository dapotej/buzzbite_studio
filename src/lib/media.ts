import "server-only";
import { fal } from "@fal-ai/client";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { assertVideoAllowed } from "./limits";

// Model endpoints are settings, so a newer model can be swapped in without a code change.
// Defaults: FLUX 3 for 4:5 photos; Kling 2.1 (standard) to animate a still into a 5-second clip.
export const IMAGE_MODEL = process.env.FAL_IMAGE_MODEL || "blackforestlabs/flux-3/text-to-image";
// Photos that show the brand's own product are drawn from its reference photos with an image-editing model.
export const REFERENCE_MODEL = process.env.FAL_REFERENCE_MODEL || "openai/gpt-image-2/edit";
export const VIDEO_MODEL = process.env.FAL_VIDEO_MODEL || "fal-ai/kling-video/v2.1/standard/image-to-video";

export class MediaError extends Error {}

/** Turns a fal.ai failure into a sentence the owner can act on. */
export function describeFalError(e: unknown): string {
  const err = e as { status?: number; body?: { detail?: unknown }; message?: string };
  const detail = err?.body?.detail;
  const text = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d) => (d as { msg?: string }).msg ?? JSON.stringify(d)).join("; ") : "";
  if (err?.status === 401) return "fal.ai rejected the API key. Check FAL_KEY in Vercel.";
  if (err?.status === 403) return `fal.ai refused the request${text ? `: ${text}` : ""}. This usually means the fal.ai account has no credit left (top up at fal.ai/dashboard/billing) or the key is wrong.`;
  if (err?.status === 404) return `fal.ai does not know the model ${IMAGE_MODEL}. Set FAL_IMAGE_MODEL in Vercel.`;
  if (err?.status === 422) return `fal.ai could not use the request${text ? `: ${text}` : ""}.`;
  if (e instanceof MediaError || (e instanceof Error && e.name === "LimitError")) return e.message;
  return `fal.ai error${err?.status ? ` ${err.status}` : ""}${text ? `: ${text}` : err?.message ? `: ${err.message}` : ""}.`;
}

function configure() {
  if (!process.env.FAL_KEY) throw new MediaError("AI images need a fal.ai key. Add FAL_KEY in Vercel's environment variables.");
  fal.config({ credentials: process.env.FAL_KEY });
}

/** Queues an image generation and returns fal's request id. */
export async function queueImage(prompt: string): Promise<{ endpoint: string; requestId: string }> {
  configure();
  const res = await fal.queue.submit(IMAGE_MODEL, { input: { prompt, aspect_ratio: "4:5", num_images: 1 } });
  return { endpoint: IMAGE_MODEL, requestId: res.request_id };
}

/** Queues a 4:5 photo drawn from reference photos of the brand's product. */
export async function queueReferenceImage(prompt: string, referenceUrls: string[]): Promise<{ endpoint: string; requestId: string }> {
  configure();
  const res = await fal.queue.submit(REFERENCE_MODEL, {
    input: { prompt, image_urls: referenceUrls.slice(0, 4), image_size: { width: 1024, height: 1280 }, quality: "high", num_images: 1, output_format: "jpeg" },
  });
  return { endpoint: REFERENCE_MODEL, requestId: res.request_id };
}

/** Queues a 5-second clip animated from an existing image. */
export async function queueVideo(prompt: string, imageUrl: string): Promise<{ endpoint: string; requestId: string }> {
  await assertVideoAllowed(); // plan limit: AI videos per month
  configure();
  const res = await fal.queue.submit(VIDEO_MODEL, { input: { prompt, image_url: imageUrl, duration: "5", aspect_ratio: "9:16" } });
  return { endpoint: VIDEO_MODEL, requestId: res.request_id };
}

type Outcome = { state: "pending" } | { state: "done"; url: string; contentType: string } | { state: "failed"; error: string };

/** Checks a queued job. When it has finished, copies the file into Vercel Blob (fal's URLs expire). */
export async function checkJob(endpoint: string, requestId: string, kind: "image" | "video", brandId: string): Promise<Outcome> {
  configure();
  let status;
  try {
    status = await fal.queue.status(endpoint, { requestId });
  } catch (e) {
    return { state: "failed", error: `fal.ai could not report on this job: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (status.status !== "COMPLETED") return { state: "pending" };
  let data: Record<string, unknown>;
  try {
    data = (await fal.queue.result(endpoint, { requestId })).data as Record<string, unknown>;
  } catch (e) {
    return { state: "failed", error: `The generation failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  const src =
    kind === "image"
      ? (data.images as { url?: string }[] | undefined)?.[0]?.url ?? (data.image as { url?: string } | undefined)?.url
      : (data.video as { url?: string } | undefined)?.url;
  if (!src) return { state: "failed", error: "The model finished but returned no file." };
  const file = await fetch(src);
  if (!file.ok) return { state: "failed", error: "Could not download the generated file." };
  if (kind === "image") {
    // Store photos at post size as a compact JPEG: generated files are often several MB.
    const jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 1080, height: 1350, fit: "cover", position: "attention" })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
    const blob = await put(`brands/${brandId}/ai-${requestId}.jpg`, jpeg, { access: "public", contentType: "image/jpeg", addRandomSuffix: true });
    return { state: "done", url: blob.url, contentType: "image/jpeg" };
  }
  const contentType = file.headers.get("content-type") || "video/mp4";
  const blob = await put(`brands/${brandId}/ai-${requestId}.mp4`, file.body!, { access: "public", contentType, addRandomSuffix: true });
  return { state: "done", url: blob.url, contentType };
}
