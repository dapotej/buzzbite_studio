import type { Media, PostSpec } from "./types";

/** Turns Claude's draft (which names a library item by id) into a stored post. */
export function attachMedia(
  draft: { spec: Omit<PostSpec, "media">; mediaId: string; linkedin: string; instagram: string },
  library: Media[],
): { spec: PostSpec; linkedin: string; instagram: string } {
  const m = library.find((x) => x.id === draft.mediaId && x.status === "ready" && x.url);
  const spec: PostSpec = { ...draft.spec, media: m ? { id: m.id, url: m.url!, kind: m.kind } : null };
  // A photo post without a photo falls back to a statement.
  if (spec.template === "photo" && !spec.media) spec.template = "statement";
  return { spec, linkedin: draft.linkedin, instagram: draft.instagram };
}
