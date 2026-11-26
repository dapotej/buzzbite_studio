import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { BrandProfileSchema, PostSpecSchema, TrendReportSchema, type BrandProfile, type Idea, type Media, type PostSpec } from "./types";

const MODEL = "claude-opus-5-5";
const client = new Anthropic();

export class AIError extends Error {}

/**
 * One structured call to Claude. Uses server-side refusal fallbacks so a
 * policy decline on the main model is retried on a fallback model in the same call.
 */
async function structured<T extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: T;
  effort?: "low" | "medium" | "high";
}): Promise<z.infer<T>> {
  try {
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
    });
    if (res.stop_reason === "refusal") throw new AIError("Claude declined this request. Try rewording it.");
    if (res.stop_reason === "max_tokens") throw new AIError("The answer was too long. Try a shorter input.");
    if (!res.parsed_output) throw new AIError("Claude's answer could not be read. Try again.");
    return res.parsed_output as z.infer<T>;
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AIError("The Claude API key is missing or invalid.");
    if (e instanceof Anthropic.RateLimitError) throw new AIError("Claude is busy. Wait a minute and try again.");
    if (e instanceof Anthropic.APIError) throw new AIError(`Claude API error (${e.status}). Try again.`);
    throw e;
  }
}

const brandBrief = (b: BrandProfile) => JSON.stringify(b, null, 2);

const VOICE_RULES = `Writing rules:
- Plain, specific, confident. Short sentences.
- Never invent statistics, client names, prices or results. Use only facts in the brand profile.
- No hype words (revolutionary, game-changer, unlock, elevate, seamless), no exclamation marks.
- Follow the brand's own voice do/don't lists over these rules where they conflict.`;

// ---------------------------------------------------------------------------

export async function draftBrandProfile(name: string, source: string): Promise<BrandProfile> {
  return structured({
    system:
      "You are a brand strategist setting up a social media content system for a business. " +
      "Read the source material and produce a brand profile. Use only what the material supports; " +
      "where it says nothing, make a sensible, clearly modest choice. Facts must be copied from the material, never invented. " +
      "Colours must be #RRGGBB. Fonts must be real Google Fonts families.",
    prompt: `Business name: ${name}\n\nSource material:\n<source>\n${source}\n</source>`,
    schema: BrandProfileSchema,
    effort: "medium",
  });
}

const IdeaListSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string().describe("The post idea in under 12 words."),
      angle: z.string().describe("2-3 sentences: the hook, the point, and why this audience cares now."),
      pillar: z.string().describe("Exactly one of the brand's pillar names."),
      format: z.enum(["image", "video"]),
    }),
  ),
});

export async function generateIdeas(brand: BrandProfile, opts: { count: number; focus: string; avoid: string[]; today: string }) {
  const out = await structured({
    system:
      "You are a senior social media strategist for B2B and consumer brands on LinkedIn and Instagram. " +
      "You come up with specific, useful post ideas that a busy founder would be glad to publish.\n\n" +
      VOICE_RULES,
    prompt: `Brand profile:\n${brandBrief(brand)}

Today is ${opts.today}. Suggest ${opts.count} post ideas.
- Spread them across the pillars.
- Make at least a quarter of them videos (short animated posts).
- Use the season and upcoming moments where they fit this audience.
- Ground ideas in real customer problems and questions this audience has.
${opts.focus ? `- The user asked to focus on: ${opts.focus}` : ""}
${opts.avoid.length ? `Do not repeat these recent ideas:\n${opts.avoid.map((t) => `- ${t}`).join("\n")}` : ""}`,
    schema: IdeaListSchema,
    effort: "medium",
  });
  return out.ideas;
}

const DraftSchema = z.object({
  spec: PostSpecSchema,
  mediaId: z.string().describe("photo template only: the id of the library item to use, or empty string."),
  linkedin: z.string().describe("LinkedIn caption: 60-150 words, hook first line, line breaks between ideas, at most 3 hashtags at the end."),
  instagram: z.string().describe("Instagram caption: 30-80 words, hook first, 5-8 relevant hashtags at the end."),
});

const TEMPLATE_GUIDE = `Templates:
- statement: one bold headline (theme light or dark). Best default.
- stat: one big figure + label. Only if the brand facts contain a real number for it.
- list: headline + 3-4 items with short details. Good for "what you get", "how to", checklists.
- chat: 4-6 chat bubbles that dramatise the customer's problem (fromCustomer true = the customer) + headline.
- photo: a photo or video clip from the brand's media library fills the post, with kicker + headline (+ optional sub) over it. Use it when a library item fits the idea well; set mediaId.
- motion: animated video. 2-3 short lines appear one by one, then an end card with endline + cta.
Fill the fields the chosen template uses; set unused strings to "" and unused arrays to [].`;

const libraryBrief = (media: Media[]) =>
  media.length
    ? `Media library (photo template can use one):\n${media.slice(0, 40).map((m) => `- id ${m.id} (${m.kind}): ${m.description}`).join("\n")}`
    : "Media library: empty, so do not use the photo template.";

export async function draftPost(brand: BrandProfile, idea: Pick<Idea, "title" | "angle" | "pillar" | "format">, media: Media[] = []) {
  return structured({
    system:
      "You are a social media designer and copywriter. You turn a post idea into one finished post: " +
      "the on-image text for a brand template plus captions for LinkedIn and Instagram.\n\n" +
      VOICE_RULES +
      "\n- On-image text is tiny: the headline is six words or fewer; everything else goes in the caption.\n\n" +
      TEMPLATE_GUIDE,
    prompt: `Brand profile:\n${brandBrief(brand)}

Idea: ${idea.title}
Angle: ${idea.angle}
Pillar: ${idea.pillar}
Format wanted: ${idea.format === "video" ? "video (use the motion template, or photo with a video clip)" : "image (pick the best static template)"}

${libraryBrief(media)}`,
    schema: DraftSchema,
    effort: "medium",
  });
}

export async function revisePost(
  brand: BrandProfile,
  current: { spec: PostSpec; linkedin: string; instagram: string },
  instruction: string,
  media: Media[] = [],
) {
  return structured({
    system:
      "You are a social media designer and copywriter revising an existing post for a brand. " +
      "Apply the user's instruction and change nothing else.\n\n" +
      VOICE_RULES +
      "\n\n" +
      TEMPLATE_GUIDE,
    prompt: `Brand profile:\n${brandBrief(brand)}

Current post:\n${JSON.stringify(current, null, 2)}

${libraryBrief(media)}

Instruction: ${instruction}`,
    schema: DraftSchema,
    effort: "low",
  });
}

// ---------------------------------------------------------------------------
// Visual prompts for fal.ai

const PromptSchema = z.object({ prompt: z.string().describe("The generation prompt, 40-90 words.") });

export async function writeImagePrompt(brand: BrandProfile, brief: string) {
  const out = await structured({
    system:
      "You write prompts for a photorealistic image model. Describe one concrete scene: subject, setting, composition for a 4:5 portrait frame " +
      "with calm space in the top or bottom third for a headline, lens and light, mood. Never ask for text, letters, logos, signage or brand names in the image. " +
      "Never depict real, identifiable people.",
    prompt: `Brand: ${brand.name}. ${brand.oneLiner}\nArt direction: ${brand.imageStyle || "Natural, modern, premium photography."}\nAccent colour to echo subtly: ${brand.colors.primary}\n\nWhat the image is for: ${brief}`,
    schema: PromptSchema,
    effort: "low",
  });
  return out.prompt;
}

export async function writeVideoPrompt(brand: BrandProfile, imageDescription: string, brief: string) {
  const out = await structured({
    system:
      "You write prompts for an image-to-video model that animates a still photo into a 5-second clip. Describe only the motion: " +
      "camera movement (slow push-in, gentle pan), what moves in the scene, and the pace. Keep it subtle and realistic. No text, no cuts.",
    prompt: `Brand: ${brand.name}. Art direction: ${brand.imageStyle}\nThe still image shows: ${imageDescription}\nWhat the clip is for: ${brief || "a calm, premium background clip for a social post"}`,
    schema: PromptSchema,
    effort: "low",
  });
  return out.prompt;
}

// ---------------------------------------------------------------------------
// Trend radar: research with live web search, then structure into recommendations.

export async function researchTrends(brand: BrandProfile, today: string, focus: string) {
  const system =
    "You are a social media strategist researching what is happening right now for a brand's market. " +
    "Use web search. Look for: recent news in the industry and the brand's country/city; upcoming events, holidays and seasonal moments in the next 6 weeks; " +
    "what competitors and adjacent brands are posting about; questions and debates the target audience is having; platform trends on LinkedIn and Instagram. " +
    "Only report things you found in sources, with dates. Write research notes: numbered findings, each with its source URLs.";
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    {
      role: "user",
      content: `Brand profile:\n${brandBrief(brand)}\n\nToday is ${today}.${focus ? ` Focus especially on: ${focus}.` : ""}\nResearch the trends and moments this brand should post about in the next few weeks.`,
    },
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
    if (e instanceof AIError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AIError("The Claude API key is missing or invalid.");
    if (e instanceof Anthropic.RateLimitError) throw new AIError("Claude is busy. Wait a minute and try again.");
    if (e instanceof Anthropic.APIError) throw new AIError(`Claude API error (${e.status}). Try again.`);
    throw e;
  }
  if (!notes.trim()) throw new AIError("The research came back empty. Try again.");

  const report = await structured({
    system:
      "You turn web research notes into a trend radar for a brand's social media: 6-10 recommendations, most timely first. " +
      "Each must be grounded in the notes and cite only URLs listed in the sources. Skip anything not relevant to this brand's audience.\n\n" +
      VOICE_RULES,
    prompt: `Brand profile:\n${brandBrief(brand)}\n\nToday is ${today}.\n\nResearch notes:\n<notes>\n${notes}\n</notes>\n\nSources found:\n${[...sources]
      .map(([url, title]) => `- ${title}: ${url}`)
      .join("\n")}`,
    schema: TrendReportSchema,
    effort: "medium",
  });
  // Keep only citations that came from the search results.
  report.items = report.items.map((i) => ({ ...i, sources: i.sources.filter((s) => sources.has(s.url)).slice(0, 4) }));
  return report;
}
