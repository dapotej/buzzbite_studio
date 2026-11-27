import { NextResponse } from "next/server";
import { z } from "zod";
import { draftOne } from "@/lib/ai";
import { postAllowance } from "@/lib/limits";
import { getBrand, getTrendReport, updateTrendItems } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { emptyDates, savePost } from "@/lib/pipeline";

export const maxDuration = 120;

const Body = z.object({ reportId: z.uuid(), index: z.number().int().min(0), date: z.iso.date().optional() });
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Turns a trend idea into a finished post on the chosen day, or the next free posting day. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return notFound();
  const { reportId, index, date: chosen } = Body.parse(await req.json());
  const report = await getTrendReport(reportId);
  const item = report?.items[index];
  if (!report || report.brand_id !== id || !item) return notFound();

  const start = new Date(); start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 60);
  const date = chosen ?? (await emptyDates(brand, iso(start), iso(end)))[0] ?? iso(start);
  await postAllowance(); // plan limit: posts per month
  const draft = await draftOne(brand.profile, `${item.title}. Why now: ${item.whyNow} Post idea: ${item.recommendation} Preferred format: ${item.format}.`, date);
  const post = await savePost(brand, draft, date);
  report.items[index] = { ...item, addedPostId: post.id };
  await updateTrendItems(report.id, report.items);
  return NextResponse.json({ id: post.id, date });
});
