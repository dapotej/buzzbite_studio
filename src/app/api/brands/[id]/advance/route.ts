import { NextResponse } from "next/server";
import { getBrand } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { advance } from "@/lib/pipeline";

export const maxDuration = 120;

/** Checks the photos and clips being made for this brand and moves finished posts to review. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return notFound();
  return NextResponse.json(await advance(brand));
});
