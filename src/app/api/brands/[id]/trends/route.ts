import { NextResponse } from "next/server";
import { z } from "zod";
import { researchTrends } from "@/lib/ai";
import { getBrand, insertTrendReport } from "@/lib/db";
import { handle, notFound } from "@/lib/http";

// Web research takes a couple of minutes.
export const maxDuration = 300;

const Body = z.object({ focus: z.string().max(500).default("") });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return notFound();
  const { focus } = Body.parse(await req.json());
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const report = await researchTrends(brand.profile, today, focus);
  const saved = await insertTrendReport(id, report.summary, report.items);
  return NextResponse.json({ id: saved.id });
});
