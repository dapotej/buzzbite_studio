import { NextResponse } from "next/server";
import { signatureMatches } from "@/lib/auth";
import { advanceBrand, ownerOfFalRequest } from "@/lib/system";

export const maxDuration = 120;

/** fal.ai calls this when a photo, clip or sound finishes, so the post moves on with no browser open. */
export async function POST(req: Request) {
  if (!(await signatureMatches("fal", new URL(req.url).searchParams.get("token")))) return NextResponse.json({ error: "Bad token." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { request_id?: string };
  if (!body.request_id) return NextResponse.json({ error: "No request id." }, { status: 400 });
  const owner = await ownerOfFalRequest(body.request_id);
  // The job can finish before its row is saved; a non-2xx makes fal try again shortly.
  if (!owner) return NextResponse.json({ error: "Unknown job." }, { status: 404 });
  try {
    return NextResponse.json(await advanceBrand(owner));
  } catch (e) {
    console.error("fal webhook failed", e);
    return NextResponse.json({ error: "Failed." }, { status: 500 });
  }
}
