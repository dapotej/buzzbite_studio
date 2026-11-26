import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { BrandProfileSchema, PostSpecSchema, type BrandProfile, type Idea, type PostSpec } from "./types";

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
  linkedin: z.string().describe("LinkedIn caption: 60-150 words, hook first line, line breaks between ideas, at most 3 hashtags at the end."),
  instagram: z.string().describe("Instagram caption: 30-80 words, hook first, 5-8 relevant hashtags at the end."),
});

const TEMPLATE_GUIDE = `Templates:
- statement: one bold headline (theme light or dark). Best default.
- stat: one big figure + label. Only if the brand facts contain a real number for it.
- list: headline + 3-4 items with short details. Good for "what you get", "how to", checklists.
- chat: 4-6 chat bubbles that dramatise the customer's problem (fromCustomer true = the customer) + headline.
- motion: animated video. 2-3 short lines appear one by one, then an end card with endline + cta.
Fill the fields the chosen template uses; set unused strings to "" and unused arrays to [].`;

export async function draftPost(brand: BrandProfile, idea: Pick<Idea, "title" | "angle" | "pillar" | "format">) {
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
Format wanted: ${idea.format === "video" ? "video (use the motion template)" : "image (pick the best static template)"}`,
    schema: DraftSchema,
    effort: "medium",
  });
}

export async function revisePost(
  brand: BrandProfile,
  current: { spec: PostSpec; linkedin: string; instagram: string },
  instruction: string,
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

Instruction: ${instruction}`,
    schema: DraftSchema,
    effort: "low",
  });
}
