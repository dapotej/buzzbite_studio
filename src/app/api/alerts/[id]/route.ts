import { NextResponse } from "next/server";
import { requireSession } from "@/lib/accounts";
import { dismissAlert } from "@/lib/alerts";
import { handle } from "@/lib/http";

/** Hides an alert the owner has dealt with. */
export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await dismissAlert((await requireSession()).workspace.id, id);
  return NextResponse.json({ ok: true });
});
