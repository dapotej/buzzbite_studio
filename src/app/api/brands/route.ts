import { NextResponse } from "next/server";
import { z } from "zod";
import { draftBrandProfile } from "@/lib/ai";
import { createBrand } from "@/lib/db";
import { handle } from "@/lib/http";
import type { BrandProfile } from "@/lib/types";

export const maxDuration = 120;

const Body = z.object({ name: z.string().trim().min(1).max(80), source: z.string().max(60_000).default("") });

function blankProfile(name: string): BrandProfile {
  return {
    name, oneLiner: "", offerings: [], audience: [], pillars: [], voice: { traits: [], do: [], dont: [] },
    facts: [], ctas: [], hashtags: [], website: "",
    colors: { primary: "#FFB020", dark: "#15171A", light: "#F5F4F0", supporting: [] },
    imageStyle: "",
    fonts: { display: "Poppins", body: "Inter" },
  };
}

export const POST = handle(async (req: Request) => {
  const { name, source } = Body.parse(await req.json());
  const profile = source.trim().length > 40 ? { ...(await draftBrandProfile(name, source)), name } : blankProfile(name);
  const brand = await createBrand(profile);
  return NextResponse.json({ id: brand.id });
});
