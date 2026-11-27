import { NextResponse } from "next/server";
import { getBrand } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { syncResults } from "@/lib/results";

export const maxDuration = 60;

/** Reads the latest numbers from Zernio (at most once an hour unless forced). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return notFound();
  const force = new URL(req.url).searchParams.get("force") === "1";
  return NextResponse.json(await syncResults(brand, { force }));
});
