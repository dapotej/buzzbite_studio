import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ownerOfPost, ownerOfZernioPost, syncOne, zernioWebhookSecret } from "@/lib/system";

export const maxDuration = 60;

/** Zernio calls this when a post is published or fails. The post's result is then read back from Zernio. */
export async function POST(req: Request) {
  const raw = await req.text();
  const given = (req.headers.get("x-zernio-signature") ?? "").replace(/^sha256=/, "");
  const expected = createHmac("sha256", await zernioWebhookSecret()).update(raw).digest("hex");
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }
  const event = JSON.parse(raw || "{}") as { event?: string; post?: { id?: string; _id?: string; metadata?: { buzzbitePostId?: string } } };
  const zid = event.post?.id ?? event.post?._id;
  const ours = event.post?.metadata?.buzzbitePostId;
  const owner = (ours && /^[0-9a-f-]{36}$/.test(ours) ? await ownerOfPost(ours) : null) ?? (zid ? await ownerOfZernioPost(zid) : null);
  if (!owner) return NextResponse.json({ received: true, matched: false }); // not one of ours, or already removed
  try {
    await syncOne(owner);
  } catch (e) {
    console.error("zernio webhook failed", e);
    return NextResponse.json({ error: "Failed." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
