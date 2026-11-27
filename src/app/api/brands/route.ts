import { NextResponse } from "next/server";
import { assertBrandAllowed } from "@/lib/limits";
import { z } from "zod";
import { draftBrandProfile } from "@/lib/ai";
import { createBrand } from "@/lib/db";
import { handle } from "@/lib/http";
import type { BrandProfile } from "@/lib/types";

export const maxDuration = 120;

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  source: z.string().max(60_000).default(""),
  website: z.string().trim().max(200).default(""),
});

function blankProfile(name: string, website: string): BrandProfile {
  return {
    name, oneLiner: "", offerings: [], audience: [], pillars: [], voice: { traits: [], do: [], dont: [] },
    facts: [], ctas: [], hashtags: [], website, imageStyle: "",
    colors: { primary: "#2F5BEA", dark: "#15171C", light: "#F5F6F8", supporting: [] },
    fonts: { display: "Poppins", body: "Inter" },
  };
}

/** Creates a brand. With enough source material, Claude drafts the profile. */
export const POST = handle(async (req: Request) => {
  const { name, source, website } = Body.parse(await req.json());
  await assertBrandAllowed(); // plan limit: brands
  const text = [source, website && `Website: ${website}`].filter(Boolean).join("\n\n");
  const profile = source.trim().length > 40
    ? { ...(await draftBrandProfile(name, text)), name, website: website || undefined } as BrandProfile
    : blankProfile(name, website);
  if (!profile.website) profile.website = website;
  const brand = await createBrand(profile);
  return NextResponse.json({ id: brand.id });
});
