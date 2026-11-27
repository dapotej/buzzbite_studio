import { NextResponse } from "next/server";
import { handlePaystackEvent, verifyPaystackSignature } from "@/lib/payments";

/** Paystack webhook: payments, subscriptions created, failed or disabled. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyPaystackSignature(raw, req.headers.get("x-paystack-signature"))) return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  try {
    await handlePaystackEvent(JSON.parse(raw));
  } catch (e) {
    console.error("paystack webhook failed", e);
    return NextResponse.json({ error: "Failed." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
