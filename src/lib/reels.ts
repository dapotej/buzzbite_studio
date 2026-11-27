import "server-only";
import { countPendingMedia, getPost, insertMedia, updatePost } from "./db";
import { describeFalError, queueMusic, queueVideo, queueVoice } from "./media";
import { queuePhoto } from "./pipeline";
import { reelReady, type Brand, type Post, type PostSpec, type ReelAssets } from "./types";

// Reels: per scene a vertical photo, animated into a clip, plus a voice-over line;
// one instrumental music bed for the whole reel. Assembled into an MP4 in the browser.
export const SCENE_SECONDS = 5;
const MAX_SCENES = 4;

type Outcome = { state: "done"; url: string } | { state: "failed"; error: string } | { state: "pending" };

const sceneRole = (i: number, part: "image" | "video" | "voice") => `scene:${i}:${part}`;

/**
 * Queues whatever a reel is missing. With `previous` (the reel before a revision), a scene keeps its
 * photo and clip while its imagePrompt is unchanged, and its voice while its voice-over is unchanged.
 */
export async function startReelMedia(brand: Brand, post: Post, previous?: PostSpec): Promise<Post> {
  const scenes = post.spec.scenes.slice(0, MAX_SCENES);
  if (!scenes.length) return (await updatePost(post.id, { status: "review", issue: "This reel has no scenes yet. Ask for a change, e.g. \"make this a reel\"." }))!;
  const old = previous?.reel ?? post.spec.reel ?? null;
  const prevScenes = previous?.scenes ?? post.spec.scenes;
  const assets: ReelAssets = {
    scenes: scenes.map((s, i) => {
      const was = old?.scenes[i];
      const p = prevScenes[i];
      const sameVisual = !!p && p.imagePrompt === s.imagePrompt && p.motionPrompt === s.motionPrompt;
      const sameVoice = !!p && p.voiceover === s.voiceover;
      return { image: sameVisual ? was?.image ?? null : null, clip: sameVisual ? was?.clip ?? null : null, voice: sameVoice ? was?.voice ?? null : null };
    }),
    music: previous && previous.music !== post.spec.music ? null : old?.music ?? null,
  };

  const problems: string[] = [];
  let queued = 0;
  const queue = async (role: string, kind: "image" | "video" | "audio", description: string, start: () => Promise<{ endpoint: string; requestId: string }>) => {
    try {
      const job = await start();
      await insertMedia({ brand_id: brand.id, post_id: post.id, role, kind, status: "pending", source: "ai", url: null, description: description.slice(0, 300), fal_endpoint: job.endpoint, fal_request_id: job.requestId });
      queued++;
    } catch (e) {
      problems.push(describeFalError(e));
    }
  };
  for (const [i, s] of scenes.entries()) {
    const a = assets.scenes[i];
    if (!a.image) await queue(sceneRole(i, "image"), "image", s.imagePrompt, () => queuePhoto(brand, s.imagePrompt, post.spec.showsProduct, "9:16"));
    else if (!a.clip) await queue(sceneRole(i, "video"), "video", `${s.imagePrompt} (animated)`, () => queueVideo(s.motionPrompt || "Slow, subtle camera push-in with natural movement.", a.image!, post.id));
    if (!a.voice) await queue(sceneRole(i, "voice"), "audio", s.voiceover, () => queueVoice(s.voiceover, brand.settings.voice));
  }
  if (!assets.music && post.spec.music.trim()) await queue("music", "audio", post.spec.music, () => queueMusic(post.spec.music, scenes.length * SCENE_SECONDS + 3));

  const spec = { ...post.spec, reel: assets };
  if (queued) return (await updatePost(post.id, { spec, status: "making", issue: problems[0] ?? null }))!;
  return (await updatePost(post.id, { spec, status: "review", issue: problems[0] ?? (reelReady(spec) ? null : "Some parts of this reel are missing. Try again.") }))!;
}

/** Stores a finished reel part, queues the clip once a scene's photo is ready, and moves the reel to review when it is complete. */
export async function advanceReelMedia(brand: Brand, post: Post, role: string, out: Outcome): Promise<void> {
  if (out.state === "pending") return;
  const fresh = (await getPost(post.id)) ?? post;
  const assets: ReelAssets = fresh.spec.reel ?? { scenes: fresh.spec.scenes.map(() => ({ image: null, clip: null, voice: null })), music: null };
  let issue: string | null = fresh.issue;

  if (role === "music") {
    if (out.state === "done") assets.music = out.url;
    else issue = issue ?? `The music could not be made (${out.error}). The reel works without it.`;
  } else {
    const [, n, part] = role.split(":");
    const i = Number(n);
    const scene = assets.scenes[i];
    const s = fresh.spec.scenes[i];
    if (!scene || !s) return;
    if (out.state === "failed") {
      issue = `Scene ${i + 1}'s ${part === "voice" ? "voice-over" : part === "video" ? "clip" : "photo"} could not be made: ${out.error}`;
    } else if (part === "image") {
      scene.image = out.url;
      try {
        const job = await queueVideo(s.motionPrompt || "Slow, subtle camera push-in with natural movement.", out.url, post.id);
        await insertMedia({ brand_id: brand.id, post_id: post.id, role: sceneRole(i, "video"), kind: "video", status: "pending", source: "ai", url: null, description: `${s.imagePrompt} (animated)`.slice(0, 300), fal_endpoint: job.endpoint, fal_request_id: job.requestId });
      } catch (e) {
        issue = `Scene ${i + 1}'s clip could not be started. ${describeFalError(e)}`;
      }
    } else if (part === "video") scene.clip = out.url;
    else if (part === "voice") scene.voice = out.url;
  }

  const spec = { ...fresh.spec, reel: assets };
  const ready = reelReady(spec); // every scene has its clip and voice; only music can still be pending
  const pending = await countPendingMedia(post.id);
  const finished = ready || pending === 0;
  await updatePost(post.id, {
    spec,
    issue: ready ? (issue?.startsWith("The music") ? issue : null) : issue,
    status: fresh.status === "making" && finished ? "review" : fresh.status,
  });
}
