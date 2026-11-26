import { NextResponse } from "next/server";
import { z } from "zod";
import { getBrand } from "@/lib/db";
import { handle, notFound } from "@/lib/http";
import { fillDates } from "@/lib/pipeline";

// Writing a batch of posts takes a minute or two.
export const maxDuration = 300;

const Body = z.object({ from: z.iso.date(), to: z.iso.date() });

/** Creates posts for up to 7 empty posting days between from and to. Call again until remaining is 0. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return notFound();
  const { from, to } = Body.parse(await req.json());
  return NextResponse.json(await fillDates(brand, from, to, 7));
});
