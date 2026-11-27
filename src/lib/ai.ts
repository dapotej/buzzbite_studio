import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { recordClaude } from "./usage";
import { BrandProfileSchema, LOOK_OPTIONS, LookSchema, PostSpecSchema, TEMPLATES, TEMPLATE_IDS, TrendReportSchema, type BrandProfile, type Look, type Post } from "./types";

const MODEL = "claude-opus-5-5";
const client = new Anthropic();

export class AIError extends Error {}

function apiError(e: unknown): never {
  if (e instanceof AIError) throw e;
  if (e instanceof Anthropic.AuthenticationError) throw new AIError("The Claude API key is missing or invalid.");
  if (e instanceof Anthropic.RateLimitError) throw new AIError("Claude is busy. Wait a minute and try again.");
  if (e instanceof Anthropic.APIError) throw new AIError(`Claude API error (${e.status}). Try again.`);
  throw e;
}

/**
 * One structured call to Claude, streamed so long answers never time out. Server-side
 * refusal fallbacks retry a policy decline on a fallback model within the same call.
 */
async function structured<T extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: T;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  action: string;
}): Promise<z.infer<T>> {
  const format = betaZodOutputFormat(opts.schema);
  try {
    const res = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: opts.maxTokens ?? 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: opts.system,
        messages: [{ role: "user", content: opts.prompt }],
        output_config: { effort: opts.effort ?? "medium", format: { type: "json_schema", schema: format.schema } },
      })
      .finalMessage();
    await recordClaude(opts.action, res.model, res.usage);
    if (res.stop_reason === "refusal") throw new AIError("Claude declined this request. Try rewording it.");
    if (res.stop_reason === "max_tokens") throw new AIError("The answer was too long. Try fewer posts at once.");
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    try {
      return format.parse(text) as z.infer<T>;
    } catch {
      throw new AIError("Claude's answer could not be read. Try again.");
    }
  } catch (e) {
    apiError(e);
  }
}

// The look is handled by brandStyle below, so it stays out of the profile Claude reads.
const brandBrief = ({ look: _look, ...b }: BrandProfile) => JSON.stringify(b, null, 2);

/** This brand's own design and headline habits, so its posts don't read or look like anyone else's. */
function brandStyle(b: BrandProfile): string {
  const l = b.look;
  const out = ["This brand's style (follow it; it is what makes the brand's feed its own):"];
  if (l.templates.length) out.push(`- Favourite designs, best first: ${l.templates.join(", ")}. Use these for about two thirds of posts; use others now and then for variety.`);
  if (l.headlines.trim()) out.push(`- Headlines: ${l.headlines.trim()}`);
  out.push(l.emphasis === "none"
    ? "- Never wrap words in *asterisks*: this brand's headlines have no highlighted phrase."
    : "- Highlight a key phrase with *asterisks* only where it earns it, in about half the headlines at most. Vary headline shapes: not every headline is a statement followed by a highlighted twist.");
  if (l.type === "caps") out.push("- Headlines are set in capitals, so keep them especially short.");
  if (l.spacing === "airy") out.push("- The design is calm and spacious: prefer fewer words and quieter headlines.");
  return out.join("\n");
}

const VOICE_RULES = `Writing rules:
- Plain, specific, confident. Short sentences.
- Never invent statistics, client names, prices or results. Use only facts in the brand profile.
- No hype words (revolutionary, game-changer, unlock, elevate, seamless), no exclamation marks.
- The brand's own voice do/don't lists win over these rules where they conflict.`;

const DESIGN_GUIDE = `Post designs (template ids):
${TEMPLATE_IDS.map((t) => `- ${t}: ${TEMPLATES[t].guide}`).join("\n")}

Design rules:
- On-image text is tiny: headlines six words or fewer; the detail goes in the captions.
- Photo templates and video need imagePrompt: a concrete, believable scene in the brand's art direction, composed for a 4:5 portrait frame with calm space for the headline. Never ask for text, logos or signage in the image. Never depict real, identifiable people.
- showsProduct: true when the photo includes the brand's own physical product (its screens, vehicles, packaging); the brand's reference photos are then used to draw it. False for scenes without it.
- When the art direction describes how the brand's product looks or is mounted (its shape, orientation, placement, camera angle), repeat that description word for word in the imagePrompt whenever the product appears. Image models get these details wrong unless they are spelled out.
- video also needs motionPrompt (subtle, realistic camera or subject movement) and 2-3 lines.
- Fill only the fields the chosen template uses; set unused strings to "" and unused arrays to [].
- theme: pick light or dark for the non-photo templates; photo templates ignore it.`;

const CAPTION_RULES = `Captions:
- linkedin: 60-150 words, hook in the first line, line breaks between ideas, one call to action, at most 3 hashtags at the end.
- instagram: 25-70 words, hook first, one call to action, 5-8 relevant hashtags at the end.`;

const PostDraftSchema = z.object({
  title: z.string().describe("Internal title for the calendar, under 10 words."),
  pillar: z.string().describe("Exactly one of the brand's pillar names."),
  spec: PostSpecSchema,
  linkedin: z.string(),
  instagram: z.string(),
});
export type PostDraft = z.infer<typeof PostDraftSchema>;

// ---------------------------------------------------------------------------

export async function draftBrandProfile(name: string, source: string): Promise<BrandProfile> {
  return structured({
    action: "brand profile",
    system:
      "You are a brand strategist setting up an automated social media system for a business. Read the source material and produce a brand profile. " +
      "Use only what the material supports; where it says nothing, make a modest, sensible choice. Facts must come from the material, never invented. " +
      "Colours must be #RRGGBB; pick 2-4 supporting colours that suit the brand. Fonts must be real Google Fonts families. " +
      "When the material includes design signals from the brand's website, base the colours on them: primary is the most distinctive brand colour " +
      "(usually saturated, used often, or the theme colour), dark and light are the site's darkest text/background and lightest background colours, and supporting are " +
      "other brand colours from the list; ignore greys used only for borders. Use the site's fonts when they are Google Fonts; otherwise pick the closest Google Fonts family. " +
      "Take the voice from how the website actually writes. " +
      "imageStyle is art direction for AI-generated photos: places, people, light and mood that suit the brand.\n\n" + LOOK_GUIDE,
    prompt: `Business name: ${name}\n\nSource material:\n<source>\n${source}\n</source>`,
    schema: BrandProfileSchema,
  });
}

const LOOK_GUIDE =
  "look is the brand's visual system for posts, beyond colours and fonts. Every business on this platform gets posts made from the same set of designs, " +
  "so the look is what makes this brand's feed recognisably its own and different from other brands. Choose each setting from the brand's character, " +
  "industry and audience, and from the website's own design where design signals are given (rounded or square buttons, uppercase navigation, " +
  "serif or sans, busy or minimal, photo-led or graphic). Do not default to bold, highlighted, left-aligned, rounded and grid together: pick what fits. " +
  "A law firm or private bank might be editorial, no or underline emphasis, square corners, mono or natural photos, plain labels, airy. " +
  "A youth brand might be caps, highlight, round corners, vivid, dots, solid labels, bold. A hospitality brand might be light type, italic, warm photos, grain, airy. " +
  "templates: the 4-8 designs that suit what this brand has to show (photo-led brands lean on photos and video; " +
  "expertise-led brands on statements, lists and carousels; products with numbers on stat designs). " +
  "headlines: the brand's own headline habit in one or two sentences, e.g. 'Plain, factual statements with one number; no questions or puns' or " +
  "'Warm, conversational questions to the reader; no highlighted phrase'.";

/** Picks a look for an existing brand: its visual system and headline habits. */
export async function suggestLook(brand: BrandProfile, avoid?: Look): Promise<Look> {
  return structured({
    action: "brand look",
    system: "You are an art director setting the visual system for a brand's social media posts.\n\n" + LOOK_GUIDE + "\n\n" +
      `Settings and what they mean:\n${(Object.keys(LOOK_OPTIONS) as (keyof typeof LOOK_OPTIONS)[]).map((k) => `- ${k}: ${Object.entries(LOOK_OPTIONS[k]).map(([v, label]) => `${v} (${label})`).join(", ")}`).join("\n")}\n` +
      `Designs: ${TEMPLATE_IDS.map((t) => `${t} (${TEMPLATES[t].guide})`).join("; ")}`,
    prompt: `Brand profile:\n${brandBrief(brand)}${avoid ? `\n\nThe owner wants something different from the current look, so change most settings:\n${JSON.stringify(avoid)}` : ""}`,
    schema: LookSchema,
    effort: "low",
  });
}

/** Plans and writes a batch of finished posts, one per date. */
export async function planPosts(
  brand: BrandProfile,
  dates: string[],
  context: { recentTitles: string[]; trends: string; today: string },
): Promise<(PostDraft & { date: string })[]> {
  const Schema = z.object({ posts: z.array(PostDraftSchema.extend({ date: z.string().describe("One of the given dates, YYYY-MM-DD.") })) });
  const out = await structured({
    action: "plan posts",
    system:
      "You are the social media lead for a brand on LinkedIn and Instagram. You plan and write finished posts that the owner only needs to approve.\n\n" +
      VOICE_RULES + "\n\n" + DESIGN_GUIDE + "\n\n" + CAPTION_RULES + "\n\n" + brandStyle(brand),
    prompt: `Brand profile:\n${brandBrief(brand)}

Today is ${context.today}. Write one finished post for each of these publish dates: ${dates.join(", ")}.

Planning rules:
- Spread posts across the brand's pillars; tie posts to the season, holidays and events near their date where it fits the audience.
- Visual mix: ${brand.look.templates.length
    ? `lean on the brand's favourite designs (${brand.look.templates.join(", ")}), with others for variety`
    : "about half photo templates (photo, photo_band, photo_frame, photo_stat), about a fifth video, the rest graphics (statement, stat, list, chat, poster)"}; about one carousel a week (for educational or step-by-step topics) and one reel a fortnight (for stories, launches and quick tips worth narrating). Never use the same template on two consecutive dates.
- Each post must say something different. Do not repeat these recent posts:
${context.recentTitles.slice(0, 40).map((t) => `  - ${t}`).join("\n") || "  (none yet)"}
${context.trends ? `\nWhat is happening now (from today's trend research):\n${context.trends}` : ""}`,
    schema: Schema,
    effort: "medium",
    maxTokens: 64000,
  });
  const allowed = new Set(dates);
  return out.posts.filter((p) => allowed.has(p.date));
}

/** Writes one finished post from a brief (a trend idea or the owner's request). */
export async function draftOne(brand: BrandProfile, brief: string, date: string, avoidTemplate?: string): Promise<PostDraft> {
  return structured({
    action: "draft post",
    system: "You are the social media lead for a brand. Turn the brief into one finished post.\n\n" + VOICE_RULES + "\n\n" + DESIGN_GUIDE + "\n\n" + CAPTION_RULES + "\n\n" + brandStyle(brand),
    prompt: `Brand profile:\n${brandBrief(brand)}\n\nPublish date: ${date}\nBrief: ${brief}${avoidTemplate ? `\nUse a different template from "${avoidTemplate}".` : ""}`,
    schema: PostDraftSchema,
  });
}

const RevisionSchema = PostDraftSchema.extend({
  newPhoto: z.boolean().describe("True if the photo should be regenerated (the request asks for a new photo, or the image no longer fits)."),
});

/** Applies the owner's change request to a post. */
export async function revisePost(brand: BrandProfile, post: Pick<Post, "title" | "pillar" | "spec" | "linkedin" | "instagram">, instruction: string) {
  const { media, clip, ...spec } = post.spec;
  return structured({
    action: "revise post",
    system:
      "You revise a finished social post for a brand. Apply the owner's request and change nothing else. " +
      "If they ask for a new photo or the image no longer suits the post, write a new imagePrompt and set newPhoto true.\n\n" +
      VOICE_RULES + "\n\n" + DESIGN_GUIDE + "\n\n" + CAPTION_RULES + "\n\n" + brandStyle(brand),
    prompt: `Brand profile:\n${brandBrief(brand)}\n\nCurrent post:\n${JSON.stringify({ title: post.title, pillar: post.pillar, spec, linkedin: post.linkedin, instagram: post.instagram }, null, 2)}
${media ? "The post currently has a photo." : ""}${clip ? " It also has a video clip." : ""}

Request: ${instruction}`,
    schema: RevisionSchema,
    effort: "low",
  });
}

// ---------------------------------------------------------------------------
// Trend radar: research with live web search, then structure into post ideas.

export async function researchTrends(brand: BrandProfile, today: string) {
  const system =
    "You are a social media strategist researching what is happening right now for a brand's market. Use web search. Look for: recent news in the industry " +
    "and the brand's country and city; events, holidays and seasonal moments in the next 6 weeks; what competitors and similar brands are posting about; " +
    "questions and debates the audience is having; LinkedIn and Instagram trends. Only report what you found in sources, with dates. " +
    "Write research notes: numbered findings, each with its source URLs.";
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    { role: "user", content: `Brand profile:\n${brandBrief(brand)}\n\nToday is ${today}. Research what this brand should post about in the next few weeks.` },
  ];
  const sources = new Map<string, string>();
  let notes = "";
  try {
    for (let turn = 0; turn < 6; turn++) {
      const res = await client.beta.messages
        .stream({
          model: MODEL,
          max_tokens: 32000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system,
          messages,
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 12 }],
          output_config: { effort: "medium" },
        })
        .finalMessage();
      await recordClaude("trend research", res.model, res.usage);
      for (const block of res.content) {
        if (block.type === "text") notes += block.text;
        if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) if (r.type === "web_search_result") sources.set(r.url, r.title);
        }
      }
      if (res.stop_reason === "refusal") throw new AIError("Claude declined this research request.");
      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      break;
    }
  } catch (e) {
    apiError(e);
  }
  if (!notes.trim()) throw new AIError("The research came back empty. Try again.");

  const report = await structured({
    action: "trend ideas",
    system:
      "You turn web research notes into a list of 8-10 post ideas for a brand's social media, most timely first. Each idea must be grounded in the notes " +
      "and cite only URLs listed in the sources. Skip anything not relevant to this brand's audience.\n\n" + VOICE_RULES,
    prompt: `Brand profile:\n${brandBrief(brand)}\n\nToday is ${today}.\n\nResearch notes:\n<notes>\n${notes}\n</notes>\n\nSources found:\n${[...sources].map(([url, title]) => `- ${title}: ${url}`).join("\n")}`,
    schema: TrendReportSchema,
  });
  report.items = report.items.map((i) => ({ ...i, sources: i.sources.filter((s) => sources.has(s.url)).slice(0, 4) }));
  return report;
}
