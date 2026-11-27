import { NextResponse } from "next/server";
import { requireSession } from "@/lib/accounts";
import { appUrl } from "@/lib/alerts";
import { handle } from "@/lib/http";
import { ensureWebhook } from "@/lib/zernio";
import { zernioWebhookSecret } from "@/lib/system";

/** Internal: tells Zernio where to send publishing results. Safe to press more than once. */
export const POST = handle(async () => {
  const s = await requireSession();
  if (s.workspace.plan !== "internal" || s.role !== "owner") return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const r = await ensureWebhook(`${appUrl()}/api/public/zernio`, await zernioWebhookSecret());
  return NextResponse.json({ ok: true, ...r });
});
