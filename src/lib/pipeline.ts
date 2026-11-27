import "server-only";
import { planPosts, type PostDraft } from "./ai";
import {
  createPost, finishMedia, getPost, insertMedia, latestTrendReport, listPendingMedia, listPostsBetween, recentPostTitles, updatePost,
} from "./db";
import { checkJob, describeFalError, queueImage, queueVideo } from "./media";
import { TEMPLATES, type Brand, type Post, type PostSpec } from "./types";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Posting dates between from and to (inclusive) on the brand's chosen weekdays. */
export function postingDates(brand: Brand, from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(from + "T00:00:00Z"); iso(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    if (brand.settings.days.includes((d.getUTCDay() + 6) % 7)) out.push(iso(d));
  }
  return out;
}

/** Dates in the range that still need a post. */
export async function emptyDates(brand: Brand, from: string, to: string): Promise<string[]> {
  const taken = new Set((await listPostsBetween(brand.id, from, to)).map((p) => p.publish_on));
  return postingDates(brand, from, to).filter((d) => !taken.has(d));
}

const todayLong = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Plans and saves posts for up to `limit` empty dates. Returns how many were made and how many remain. */
export async function fillDates(brand: Brand, from: string, to: string, limit = 7): Promise<{ made: number; remaining: number }> {
  const empty = await emptyDates(brand, from, to);
  const batch = empty.slice(0, limit);
  if (!batch.length) return { made: 0, remaining: 0 };
  const trends = await latestTrendReport(brand.id);
  const drafts = await planPosts(brand.profile, batch, {
    recentTitles: await recentPostTitles(brand.id),
    trends: trends ? `${trends.summary}\n${trends.items.slice(0, 8).map((i) => `- ${i.title}: ${i.whyNow}`).join("\n")}` : "",
    today: todayLong(),
  });
  for (const d of drafts) await savePost(brand, d, d.date);
  return { made: drafts.length, remaining: Math.max(0, empty.length - drafts.length) };
}

/** Saves a drafted post and starts making its photo (and video) if the design needs one. */
export async function savePost(brand: Brand, draft: PostDraft, date: string | null, ideaId?: string): Promise<Post> {
  const spec: PostSpec = { ...draft.spec, media: null, clip: null };
  const post = await createPost({
    brand_id: brand.id, idea_id: ideaId ?? null, publish_on: date, status: "review",
    title: draft.title, pillar: draft.pillar, spec, linkedin: draft.linkedin, instagram: draft.instagram,
  });
  return startMedia(brand, post);
}

/** Queues the photo a post needs. Posts that need no photo go straight to review. */
export async function startMedia(brand: Brand, post: Post): Promise<Post> {
  const t = TEMPLATES[post.spec.template];
  if (!t?.usesPhoto || post.spec.media || !post.spec.imagePrompt.trim()) {
    return (await updatePost(post.id, { status: "review", issue: null }))!;
  }
  try {
    const prompt = `${post.spec.imagePrompt.trim()} Art direction: ${brand.profile.imageStyle || "natural, modern, premium photography"}. No text, letters, logos or signage.`;
    const job = await queueImage(prompt);
    await insertMedia({
      brand_id: brand.id, post_id: post.id, role: "image", kind: "image", status: "pending", source: "ai", url: null,
      description: post.spec.imagePrompt.slice(0, 300), fal_endpoint: job.endpoint, fal_request_id: job.requestId,
    });
    return (await updatePost(post.id, { status: "making", issue: null }))!;
  } catch (e) {
    const issue = describeFalError(e);
    console.error("image queue failed:", issue, JSON.stringify((e as { body?: unknown }).body ?? null));
    return (await updatePost(post.id, { status: "review", issue }))!;
  }
}

/** Checks every pending photo and clip for the brand and moves finished posts on. */
export async function advance(brand: Brand): Promise<{ pending: number }> {
  const pending = await listPendingMedia(brand.id);
  let still = 0;
  for (const m of pending) {
    if (!m.fal_endpoint || !m.fal_request_id) continue;
    const out = await checkJob(m.fal_endpoint, m.fal_request_id, m.kind, brand.id).catch((e) => ({ state: "failed" as const, error: String(e) }));
    if (out.state === "pending") { still++; continue; }
    if (out.state === "failed") await finishMedia(m.id, { status: "failed", error: out.error });
    else await finishMedia(m.id, { status: "ready", url: out.url });
    if (!m.post_id) continue;
    const post = await getPost(m.post_id);
    if (!post) continue;

    if (m.role === "image") {
      if (out.state === "failed") {
        await updatePost(post.id, { status: "review", issue: `The photo could not be made: ${out.error}` });
        continue;
      }
      const spec: PostSpec = { ...post.spec, media: { id: m.id, url: out.url, kind: "image" } };
      if (post.spec.template === "video" && !post.spec.clip) {
        try {
          const job = await queueVideo(post.spec.motionPrompt || "Slow, subtle camera push-in. Natural movement.", out.url);
          await insertMedia({
            brand_id: brand.id, post_id: post.id, role: "video", kind: "video", status: "pending", source: "ai", url: null,
            description: `${m.description} (animated)`, fal_endpoint: job.endpoint, fal_request_id: job.requestId,
          });
          await updatePost(post.id, { spec });
          still++;
          continue;
        } catch (e) {
          const issue = `The photo is ready but the video could not be started. ${describeFalError(e)}`;
          console.error("video queue failed:", issue);
          await updatePost(post.id, { spec, status: "review", issue });
          continue;
        }
      }
      await updatePost(post.id, { spec, status: post.status === "making" ? "review" : post.status, issue: null });
    } else if (m.role === "video") {
      const failed = out.state === "failed";
      const spec: PostSpec = failed ? post.spec : { ...post.spec, clip: { id: m.id, url: out.url, kind: "video" } };
      await updatePost(post.id, { spec, status: post.status === "making" ? "review" : post.status, issue: failed ? `The video could not be made: ${out.error}` : null });
    }
  }
  return { pending: still };
}
