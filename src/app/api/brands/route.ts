import { NextResponse } from "next/server";
import { assertBrandAllowed } from "@/lib/limits";
import { z } from "zod";
import { draftBrandProfile } from "@/lib/ai";
import { createBrand } from "@/lib/db";
import { handle } from "@/lib/http";
import { SiteError, describeSite, readWebsite, type SiteImport } from "@/lib/siteImport";
import { DEFAULT_LOOK, type BrandProfile } from "@/lib/types";

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
    fonts: { display: "Poppins", body: "Inter" }, look: DEFAULT_LOOK,
  };
}

/** Creates a brand. With enough source material, Claude drafts the profile. */
export const POST = handle(async (req: Request) => {
  const { name, source, website } = Body.parse(await req.json());
  await assertBrandAllowed(); // plan limit: brands
  // Read the website first: its words, colours, fonts and logo make setup much faster.
  let site: SiteImport | null = null;
  let siteNote = "";
  if (website) {
    try { site = await readWebsite(website); }
    catch (e) { siteNote = e instanceof SiteError ? e.message : "We couldn't read the website."; }
  }
  const text = [source, site ? describeSite(site) : website && `Website: ${website}`].filter(Boolean).join("\n\n");
  const profile = text.trim().length > 120
    ? { ...(await draftBrandProfile(name, text)), name, website: website || undefined } as BrandProfile
    : blankProfile(name, website);
  if (!profile.website) profile.website = website;
  const brand = await createBrand(profile, site?.logo ?? undefined);
  return NextResponse.json({ id: brand.id, site: site ? { pages: site.pages.length, logo: !!site.logo, fonts: site.fonts, url: site.url } : null, siteNote });
});
