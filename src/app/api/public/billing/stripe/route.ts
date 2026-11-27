import { NextResponse } from "next/server";
import { handleStripeEvent, verifyStripeSignature } from "@/lib/payments";

/** Stripe webhook: subscription started, changed or ended. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"))) return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  try {
    await handleStripeEvent(JSON.parse(raw));
  } catch (e) {
    console.error("stripe webhook failed", e);
    return NextResponse.json({ error: "Failed." }, { status: 500 }); // Stripe retries
  }
  return NextResponse.json({ received: true });
}
