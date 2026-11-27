import { NextResponse } from "next/server";
import { z } from "zod";
import { draftBrandProfile } from "@/lib/ai";
import { getBrand } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { SiteError, describeSite, readWebsite } from "@/lib/siteImport";

export const maxDuration = 120;

const Body = z.object({ website: z.string().trim().max(200).optional() });

/** Reads the brand's website again and proposes a refreshed brand kit. Saves nothing: the Brand kit applies what the owner picks. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return notFound();
  const website = (Body.parse(await req.json().catch(() => ({}))).website || brand.profile.website || "").trim();
  if (!website) return NextResponse.json({ error: "Add your website in the Brand kit first." }, { status: 400 });
  let site;
  try { site = await readWebsite(website); }
  catch (e) { return NextResponse.json({ error: e instanceof SiteError ? e.message : "We couldn't read the website." }, { status: 422 }); }
  const profile = await draftBrandProfile(brand.name, describeSite(site));
  return NextResponse.json({
    profile: { ...profile, name: brand.profile.name, website: site.url },
    logo: site.logo,
    site: { url: site.url, pages: site.pages.length, fonts: site.fonts },
  });
});
