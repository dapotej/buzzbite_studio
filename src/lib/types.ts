import { z } from "zod";

/** Everything Buzzbite knows about a brand. Stored as JSON on brands.profile. */
export const BrandProfileSchema = z.object({
  name: z.string(),
  oneLiner: z.string().describe("One sentence: what the business is and why it matters to customers."),
  offerings: z.array(z.object({ name: z.string(), description: z.string() })),
  audience: z.array(z.string()).describe("Who the content is for, most important first."),
  pillars: z.array(z.object({ name: z.string(), description: z.string() })).describe("3-6 recurring content themes."),
  voice: z.object({ traits: z.array(z.string()), do: z.array(z.string()), dont: z.array(z.string()) }),
  facts: z.array(z.string()).describe("Verified facts, numbers and claims that posts may use. Nothing invented."),
  ctas: z.array(z.string()).describe("Calls to action, e.g. 'Book a demo at example.com'."),
  hashtags: z.array(z.string()),
  website: z.string(),
  colors: z.object({
    primary: z.string().describe("Lead accent colour as #RRGGBB."),
    dark: z.string().describe("Dark background colour as #RRGGBB."),
    light: z.string().describe("Light background colour as #RRGGBB."),
    supporting: z.array(z.string()).describe("0-4 supporting colours as #RRGGBB."),
  }),
  imageStyle: z.string().describe("Art direction for photos: subjects, setting, light, mood. No text in images."),
  fonts: z.object({
    display: z.string().describe("Google Fonts family for headlines."),
    body: z.string().describe("Google Fonts family for body text."),
  }),
});
export type BrandProfile = z.infer<typeof BrandProfileSchema>;

/** The posting plan: which weekdays to post on (0 = Monday) and at what time. */
export type BrandSettings = { days: number[]; time: string; /** IANA time zone posts go out in. */ tz: string };

export const PLATFORMS = ["instagram", "linkedin"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_NAMES: Record<Platform, string> = { instagram: "Instagram", linkedin: "LinkedIn" };

/** A connected social account (held by the posting service, Zernio). */
export type SocialAccount = { id: string; platform: Platform; name: string; username: string; picture: string | null };
export type BrandSocial = { profileId: string | null; accounts: SocialAccount[] };

/** A final file made from a post when it is approved, hosted on Vercel Blob. */
export type PublishFile = { url: string; type: "image" | "video" | "document"; title?: string };
export type PublishState = "scheduled" | "publishing" | "published" | "partial" | "failed" | "cancelled";
export type Publishing = {
  /** Platforms this post goes to. Null means every connected account. */
  targets: Platform[] | null;
  files: Record<Platform, PublishFile[]> | null;
  /** Fingerprint of the design the files were made from; files are stale when it changes. */
  filesKey: string | null;
  zernioId: string | null;
  state: PublishState | null;
  error: string | null;
  urls: Partial<Record<Platform, string>>;
  scheduledFor: string | null;
};
export const EMPTY_PUBLISHING: Publishing = { targets: null, files: null, filesKey: null, zernioId: null, state: null, error: null, urls: {}, scheduledFor: null };

/** Fingerprint of everything that changes how a post looks, so files made from an older design are not posted. */
export function designKey(spec: PostSpec, brandUpdatedAt: string): string {
  const { media, clip, ...rest } = spec;
  const text = JSON.stringify([rest, media?.url ?? null, clip?.url ?? null, brandUpdatedAt]);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + text.length.toString(36);
}

export type Brand = {
  id: string;
  name: string;
  profile: BrandProfile;
  settings: BrandSettings;
  logo_on_light: string | null;
  logo_on_dark: string | null;
  social: BrandSocial;
  created_at: string;
  updated_at: string;
};

export const TEMPLATE_IDS = [
  "photo", "photo_band", "photo_frame", "photo_stat", "video",
  "statement", "stat", "list", "chat", "poster", "motion", "carousel",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const TEMPLATES: Record<TemplateId, { name: string; usesPhoto: boolean; video: boolean; guide: string }> = {
  photo: { name: "Photo", usesPhoto: true, video: false, guide: "Full-bleed photo, kicker label top-left, big headline at the bottom." },
  photo_band: { name: "Photo + band", usesPhoto: true, video: false, guide: "Photo on the top 60%, a solid accent-colour band below with the headline." },
  photo_frame: { name: "Framed photo", usesPhoto: true, video: false, guide: "Headline at the top on a light background, the photo framed below, a short note tag on the photo." },
  photo_stat: { name: "Photo + figure", usesPhoto: true, video: false, guide: "Full-bleed photo with a big figure in a circle (big + bigLabel) and a headline. Only when the figure is a real brand fact." },
  video: { name: "Video", usesPhoto: true, video: true, guide: "A 5-second video clip made from the photo, with 2-3 short lines appearing one by one. Use for energy, places and movement." },
  statement: { name: "Statement", usesPhoto: false, video: false, guide: "One bold headline with a highlighted phrase on a plain background." },
  stat: { name: "Big number", usesPhoto: false, video: false, guide: "One striking figure from the brand facts with a label." },
  list: { name: "Checklist", usesPhoto: false, video: false, guide: "A headline and 3-4 numbered points. Good for how-tos and buyer education." },
  chat: { name: "Chat", usesPhoto: false, video: false, guide: "4-6 chat bubbles that dramatise the customer's problem, then a headline." },
  poster: { name: "Poster", usesPhoto: false, video: false, guide: "Huge 1-2 word title (big), bold colour shapes, a short line under it. Good for seasons and greetings." },
  motion: { name: "Animated graphic", usesPhoto: false, video: true, guide: "Animated graphic: 2-3 lines appear, then an end card. Use rarely." },
  carousel: { name: "Carousel", usesPhoto: true, video: false, guide: "5-8 swipeable slides: a cover that hooks, one point per slide, then a call-to-action slide. Best for how-tos, checklists, myths vs facts, step-by-step explainers and buyer education. The cover may use a photo (imagePrompt), or leave imagePrompt empty for a graphic cover." },
};

/** The visual part of a post. Every template reads the fields it needs and ignores the rest. */
export const PostSpecSchema = z.object({
  template: z.enum(TEMPLATE_IDS),
  theme: z.enum(["light", "dark"]),
  kicker: z.string().describe("Short label, 1-4 words."),
  headline: z.string().describe("Six words or fewer. Wrap the 1-3 key words in *asterisks* to highlight them."),
  sub: z.string().describe("Optional line under the headline, under 12 words, or empty."),
  note: z.string().describe("photo_frame/poster: a short tag line, under 8 words, or empty."),
  big: z.string().describe("photo_stat/stat/poster: the big figure or 1-2 word title. Figures must come from the brand facts."),
  bigLabel: z.string().describe("photo_stat: 2-5 words under the figure, or empty."),
  items: z.array(z.object({ title: z.string(), detail: z.string() })).describe("list only: 3-4 items."),
  bubbles: z.array(z.object({ fromCustomer: z.boolean(), text: z.string() })).describe("chat only."),
  lines: z.array(z.string()).describe("video/motion: 2-3 short lines that appear one by one."),
  endline: z.string().describe("motion only: closing line on the end card."),
  cta: z.string().describe("motion only: call to action on the end card."),
  imagePrompt: z
    .string()
    .describe("Photo templates and video: a concrete photo to generate in the brand's art direction (subject, place, light, composition). No text in the image. Empty for other templates."),
  motionPrompt: z.string().describe("video only: how the photo should move in the clip (camera, subject motion), or empty."),
  slides: z
    .array(
      z.object({
        layout: z.enum(["cover", "point", "stat", "quote", "cta"]),
        kicker: z.string().describe("Short label, 1-4 words, or empty."),
        headline: z.string().describe("Under 9 words. Wrap 1-3 key words in *asterisks*."),
        body: z.string().describe("Under 30 words, or empty. cover: a one-line promise; cta: the call to action."),
        big: z.string().describe("stat: the figure (brand facts only). point: leave empty (slides are numbered automatically)."),
      }),
    )
    .describe("carousel only: 5-8 slides, first is cover, last is cta. Empty for other templates."),
});
export type Slide = PostSpec["slides"][number];
export const MediaRefSchema = z.object({ id: z.string(), url: z.string(), kind: z.enum(["image", "video"]) });
export type MediaRef = z.infer<typeof MediaRefSchema>;
/** The spec as stored: Claude's design plus the photo and clip made for it. */
export const StoredPostSpecSchema = PostSpecSchema.extend({
  media: MediaRefSchema.nullable().optional(),
  clip: MediaRefSchema.nullable().optional(),
});
export type PostSpec = z.infer<typeof StoredPostSpecSchema>;

export type PostStatus = "making" | "review" | "approved" | "posted";
export type Post = {
  id: string;
  brand_id: string;
  idea_id: string | null;
  publish_on: string | null;
  status: PostStatus;
  /** Why the photo or video could not be made, shown on the post with a retry. */
  issue: string | null;
  title: string;
  pillar: string;
  spec: PostSpec;
  linkedin: string;
  instagram: string;
  publishing: Publishing;
  created_at: string;
  updated_at: string;
};

/** True when the post exports as an MP4. */
export const isVideoPost = (spec: PostSpec) => spec.template === "motion" || spec.template === "video";

export type Media = {
  id: string;
  brand_id: string;
  post_id: string | null;
  role: "image" | "video" | null;
  kind: "image" | "video";
  status: "ready" | "pending" | "failed";
  source: "upload" | "ai";
  url: string | null;
  description: string;
  error: string | null;
  created_at: string;
};

export type Idea = {
  id: string;
  brand_id: string;
  title: string;
  angle: string;
  pillar: string;
  format: "image" | "video";
  status: "new" | "used" | "dismissed";
  created_at: string;
};

export const TrendItemSchema = z.object({
  title: z.string().describe("The post idea, in under 12 words."),
  whyNow: z.string().describe("1-2 sentences: what is happening and why it matters to this brand's audience now."),
  recommendation: z.string().describe("The post to make: hook and angle, 1-2 sentences."),
  pillar: z.string().describe("Exactly one of the brand's pillar names."),
  format: z.enum(["photo", "video", "graphic"]),
  urgency: z.enum(["this week", "this month", "any time"]),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).describe("Only URLs that appear in the research notes."),
});
export type TrendItem = z.infer<typeof TrendItemSchema> & { addedPostId?: string };
export const TrendReportSchema = z.object({
  summary: z.string().describe("2-3 sentences: what dominates this brand's market right now."),
  items: z.array(TrendItemSchema),
});
export type TrendReport = { id: string; brand_id: string; summary: string; items: TrendItem[]; created_at: string };

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
