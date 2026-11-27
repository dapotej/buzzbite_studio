import { NextResponse } from "next/server";
import { z } from "zod";
import { suggestLook } from "@/lib/ai";
import { getBrand } from "@/lib/db";
import { handle, notFound } from "@/lib/http";

export const maxDuration = 60;

/** Suggests a look for the brand (not saved: the owner previews it in the Brand kit first). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return notFound();
  const { different } = z.object({ different: z.boolean().default(false) }).parse(await req.json().catch(() => ({})));
  const look = await suggestLook(brand.profile, different ? brand.profile.look : undefined);
  return NextResponse.json({ look });
});
