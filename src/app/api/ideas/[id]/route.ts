import { NextResponse } from "next/server";
import { z } from "zod";
import { setIdeaStatus } from "@/lib/db";
import { handle } from "@/lib/http";

const Body = z.object({ status: z.enum(["new", "used", "dismissed"]) });

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await setIdeaStatus(id, Body.parse(await req.json()).status);
  return NextResponse.json({ ok: true });
});
