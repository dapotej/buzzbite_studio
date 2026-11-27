import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { syncBrand } from "@/lib/publish";

/** Picks up the results of posts that were due to go out. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return NextResponse.json({ changed: await syncBrand(id) });
});
