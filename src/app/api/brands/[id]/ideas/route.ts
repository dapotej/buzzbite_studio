import { NextResponse } from "next/server";
import { z } from "zod";
import { generateIdeas } from "@/lib/ai";
import { getBrand, insertIdeas, recentIdeaTitles } from "@/lib/db";
import { handle, notFound } from "@/lib/http";

export const maxDuration = 120;

const Body = z.object({ count: z.number().int().min(3).max(15).default(8), focus: z.string().max(500).default("") });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return notFound();
  const { count, focus } = Body.parse(await req.json());
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const ideas = await generateIdeas(brand.profile, { count, focus, avoid: await recentIdeaTitles(id), today });
  await insertIdeas(id, ideas);
  return NextResponse.json({ added: ideas.length });
});
