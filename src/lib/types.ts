import { z } from "zod";

/** Everything Brandloom knows about a brand. Stored as JSON on brands.profile. */
export const BrandProfileSchema = z.object({
  name: z.string(),
  oneLiner: z.string().describe("One sentence: what the business is and why it matters to customers."),
  offerings: z.array(z.object({ name: z.string(), description: z.string() })),
  audience: z.array(z.string()).describe("Who the content is for, most important first."),
  pillars: z
    .array(z.object({ name: z.string(), description: z.string() }))
    .describe("3-6 recurring content themes."),
  voice: z.object({
    traits: z.array(z.string()),
    do: z.array(z.string()),
    dont: z.array(z.string()),
  }),
  facts: z
    .array(z.string())
    .describe("Verified facts, numbers and claims that posts may use. Nothing invented."),
  ctas: z.array(z.string()).describe("Calls to action, e.g. 'Book a demo at example.com'."),
  hashtags: z.array(z.string()),
  website: z.string(),
  colors: z.object({
    primary: z.string().describe("Lead accent colour as #RRGGBB."),
    dark: z.string().describe("Dark background colour as #RRGGBB."),
    light: z.string().describe("Light background colour as #RRGGBB."),
  }),
  fonts: z.object({
    display: z.string().describe("Google Fonts family for headlines."),
    body: z.string().describe("Google Fonts family for body text."),
  }),
});
export type BrandProfile = z.infer<typeof BrandProfileSchema>;

export type Brand = {
  id: string;
  name: string;
  profile: BrandProfile;
  logo_on_light: string | null;
  logo_on_dark: string | null;
  created_at: string;
  updated_at: string;
};

export const TEMPLATE_IDS = ["statement", "stat", "list", "chat", "motion"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** The visual part of a post. Every template reads the fields it needs and ignores the rest. */
export const PostSpecSchema = z.object({
  template: z.enum(TEMPLATE_IDS),
  theme: z.enum(["light", "dark"]),
  kicker: z.string().describe("Short label above the headline, 1-4 words."),
  headline: z
    .string()
    .describe("Six words or fewer. Wrap the 1-3 most important words in *asterisks* to highlight them."),
  sub: z.string().describe("Optional supporting line, under 12 words. Empty string if not needed."),
  big: z.string().describe("stat template only: the big number or short figure. Must come from the brand facts."),
  items: z
    .array(z.object({ title: z.string(), detail: z.string() }))
    .describe("list template only: 3-4 items."),
  bubbles: z
    .array(z.object({ fromCustomer: z.boolean(), text: z.string() }))
    .describe("chat template only: 4-6 short chat messages that dramatise the customer's problem."),
  lines: z.array(z.string()).describe("motion template only: 2-3 short lines that appear one by one."),
  endline: z.string().describe("motion template only: the closing line on the end card."),
  cta: z.string().describe("Call to action shown on the motion end card."),
});
export type PostSpec = z.infer<typeof PostSpecSchema>;

export type Post = {
  id: string;
  brand_id: string;
  idea_id: string | null;
  publish_on: string | null;
  status: "draft" | "approved" | "posted";
  spec: PostSpec;
  linkedin: string;
  instagram: string;
  created_at: string;
  updated_at: string;
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

export const TEMPLATES: Record<TemplateId, { name: string; description: string; video: boolean }> = {
  statement: { name: "Statement", description: "One bold headline with a highlighted phrase.", video: false },
  stat: { name: "Big number", description: "One striking figure with a label.", video: false },
  list: { name: "Checklist", description: "A headline and 3-4 numbered points.", video: false },
  chat: { name: "Chat", description: "A chat thread that dramatises the customer's problem.", video: false },
  motion: { name: "Animated", description: "A 9-second animated video with an end card.", video: true },
};
